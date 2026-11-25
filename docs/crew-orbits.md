# Crew orbital formation

The home character seats every live work crew roster (working **or** idle) on the captain's growing ring, INF-1179's accepted plan.
One orbit widens as crew arrive; once its seats are full, a second orbit opens inside it, on another tilt and spinning the other way.
No third orbit ever opens.
There is no permanent orbit guide.
Model-name labels are described below; their visibility does not change the formation or motion.
The pointer does: near it the whole stage slows, and on a crewmate it pauses and that crewmate's summary opens ("Slowing near the pointer and the crewmate summary" below).

## Approved configuration

The captain's submitted settings and answers are preserved in `tests/fixtures/crew-orbits/growing-ring-settings.json`, from INF-1179's Approve and build (captain: "let's only allow 2 orbits. just keep packing the two orbits after 48?").
They supersede FI3-340's three fixed planes.
`orbitalPlanes.ts` derives both orbits from them (`GROWING_RING`, `CROWDED_PLANES`, `planeRadius`).

| Orbit | Radius | Seats | Tilt | Signed travel | Orientation | Starting phase |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| First | 150 px, growing to 256 px | 24 | 42° | +8°/s | −0.42 rad | 0 |
| Second (inside) | 150 px, growing to 210 px | 24 | 65° | −14°/s | −0.42 rad + 46° | 0.53 rad |

The first orbit starts on today's inner plane, so a lone crewmate differs from the old formation only by its radius.
Each orbit inside caps one 46 px step smaller, tilts 23° more, turns 46° further and spins against the one outside it, 1.75 times as fast.
The innermost open orbit grows a notch with every arrival, from 150 px with one crewmate to its cap with 24: radius = 150 + (cap − 150) × (n − 1) ÷ 23.
Every orbit outside it holds at its cap, so the formation never grows past its 560 px square.
Positive speed follows the original ring's decreasing angular direction.
Travel is absolute degrees per second; reverse changes orbital travel, not the crewmate's own spin.
Paths are off and no orbit is highlighted.
Reduced motion paints one settled frame.

The paths are 3D circles with a shared center and distinct radii.
The camera is orthographic; position and depth derive from the same projection.
Differently inclined paths can cross **on screen** without intersecting in 3D.
The unequal speeds are stylized choreography, not circular orbits under one shared gravity field.

## Lifecycle

`crewSignal.ts` constructs the one shared `CrewOrbit` in `adaptive` mode, and the existing home view paints it.
`orbitalPlanes.ts` is the single home of the approved constants, the growth rule and the projection.
The explicit `ring` mode remains available for the historical comparison and regression tests; `DEFAULT_ORBIT` is unchanged.

Production uses the first orbit even for a small roster; the historical single-ring geometry survives only in explicit `ring` mode.
Geometry, radius and angular slots follow the existing springs, so an orbit that widens or shrinks glides there.
A settled boot roster is placed on its planes immediately, without re-emitting already active crewmates.
Waits and tasks with parts come from the board the Tasks panel reads (`tasks.board` through the read executor), so above the board's delta trigger (more than 500 rows or 256 KiB) the folded deltas move them as a snapshot does, and a gap reads the board again.
The same board is the roster's last word: a crewmate it no longer lists as active work drifts away, once the board's `seq` has reached the `task_changed` that sent it out (`reconcileCrew`), so a task a failed start erased, which closes with no event of its own, leaves the ring as it leaves the phone's.
Reduced motion snaps the formation and lifecycle clips to their settled state.

The first orbit fills to 24 crew; the 25th opens the second orbit inside it, which fills to another 24.
Past 48 each arrival joins whichever orbit has fewer crew, the first on a tie, and both orbits pack tighter at their caps: 49 crew are 25/24, 60 are 30/30 and 72 are 36/36.
These are placement seats, never limits on tasks or changes to routing.
Every orbit keeps its crew evenly spaced: on boot, and again whenever a crewmate joins or leaves it, the orbit's members keep their order around the circle and glide (on their existing angle springs) to even slots, rotated as little as possible.
Arrivals enter at the widest vacant angular gap in the first orbit below its seats, then the orbit re-spaces.
When a member of the first orbit leaves while it is below its seats, the oldest member of the second orbit glides out to refill it; the second orbit then shrinks a notch, and closes once it is empty.
No member changes orbit except by that refill; fast threshold bounces do not reverse the move.
The member's plane projection follows a spring, like its existing angle and radius; reduced motion settles it immediately.
Reports, steers, launch trails and first mate cues use the same projected path as the member; home/away departures, failure nudges and working/idle colors are retained.
Crowded glyphs use the approved roughly 25-pixel base; idle crew retain the slow spin and cool light rather than moving beyond the outer canvas boundary.
The far/near canvases also draw members in depth order within each layer.
At the minimum window height the crowded formation scales uniformly to fit above the activity line and input, preserving the angles and relative radii; explicit historical ring mode stays at its original scale.
The fit remains responsive with reduced motion enabled.
A move to a display of another density changes only the pixel ratio, so under reduced motion the ring paints its last settled frame again from its own inputs at the new sharpness, and the crew stay where they stood (`onPixelRatioChange` in `src/renderer/src/character/pixelRatio.ts`, shared with the first mate).
The size control's zoom also changes the window's height in CSS pixels, which restarts the loop and paints the still afresh.

## The spark out to a crewmate

The spark out to a crewmate flies when something sent reaches it, never when a message is only recorded (INF-759).
The core announces it as a `task_event` push with `reached: true` (`announceReach` in `crewSteer.ts`), and `applyCrewEvent` draws the spark from it.
A message sparks when its lane row first goes out into a turn (`deliverRows`), so a message held for an account or a computer, or queued behind a turn, sparks when the crewmate takes it, and one delivered again sparks only once.
An interrupt or cancel sparks as it is asked, the first mate's or the captain's Stop alike; a settle sparks before the task closes, except a superseded one, whose successor's start is its spark.
An edit the crewmate never hears also sparks, because its task changed: an `update_task` field edit other than its policies, a withdrawn merge, and a wait added or removed by `link_tasks`; a policy change sparks as its notice lands.
The crewmate's own lane rows, a job's result and a renewed conversation's reason, were sent by nobody and draw nothing.
A crewmate whose task closes while its spark is still flying leaves on the frame after the spark lands (`leaveAfter` in `orbit.ts`); a settled frame lands it at once.

## Multiple work computers

With more than one configured work computer, the home stage keeps the home formation as it is and seats every other computer's crew beside it (the captain's FI3-1519 plan, 2026-10-10, built on the captain's FI3-1406 Home constellation).
The home cluster contains the one first mate; each other computer's crew use an invisible local center.
Spacing, local motion and quiet machine names establish the clusters, without plates, outlines, center markers or crew counts.
A cluster shows its machine name only while it has crew and a computer other than home on the page has crew; an empty cluster never shows one (`ComputerOrbits.labeled`).
The home orbit keeps its original owner, radius, glyph size, motion, expressions, model names and height-fit transform in every scene, including multiple computers.
The first mate stays at its original 300 px size.

**Every cluster is the home formation at half its size** (`CLUSTER_LAYOUT.sizeShare`): the same growing ring, tilts, seats, directions and degrees per second, only scaled, so one orbit widens from 75 px to 128 px over its first 24 crew and a second opens inside it from the 25th, growing to 105 px, as home does.
Remote glyphs keep their 23 px (18 px past twelve crew) with home's depth cue, nearer larger.
Model names follow the home rule cluster by cluster, under the same Appearance switch: shown while that cluster has one occupied orbit with eight crew or fewer, hidden past that (`crewModelLabelsVisible` over that cluster's frames); a hidden name stays readable to the keyboard.

**Seats.**
The clusters with crew on the page sit in two wings (`ComputerOrbits.targets`): the first computer in pairing order right of the home formation, the second left, the third right again, stacked top to bottom within a wing and centered on the first mate's height.
A wing stands beyond the home formation's edge - its outer occupied orbit plus half a glyph - by a 40 px gap plus its widest cluster's radius, and stacked clusters keep that gap plus room for a name between them.
A computer with no crew keeps no seat, so the others close up; its first crewmate seats it.
A seat glides on a spring when the formations around it grow or shrink (each of home's first 24 crew moves both wings about 4.6 px out), a new seat appears in place, and reduced motion settles seats at once.
The machine name sits 20 px under the cluster's edge and follows its seat.

**The crew layer is the window.**
With one computer or several, the two crew canvases grow to the window's width and to its height less the room the activity line and the input keep (`sceneBox` in `CrewOrbit.tsx`), centered on the first mate and never smaller than the home formation's 560 px square or than the scene reaches; they already lie under the rails, their panels, the cards and the message box, and nothing in the app moves or resizes for them.
A cluster may sit under an open panel; a crewmate under a panel or a card takes no pointer and no hover, since the pointer counts only on the stage itself.
No box holds a crewmate in (captain, INF-5726: "why can't we just let the crewmates render anywhere without being bounded? two computers' animations can totally overlap"): a companion's circle and a task's moons keep their full size wherever they ride, so they may pass beyond the window's edge, under the top bar or the input, or over another computer's cluster or the first mate, and no cluster's seat moves apart for them.
The whole scene, the first mate included, shrinks only when the window is shorter than the home formation (the existing fit) or narrower or shorter than the wings, never below 30 percent (`sceneFit`, written to the stylesheet as `sceneFitCss` so a still frame keeps fitting as the window changes); the model publishes how far the scene reaches as `OrbitFrame.scene`.
At 1280 by 800 two computers of eight shrink nothing; five computers of twenty-four each fit at about 60 percent.

**One path for a remote clip.**
A remote spark flies one curved screen-space path from the first mate's core to its slot (`arcBetween` in `orbitPaths.ts`), re-aimed at the live slot each frame, eased out once and unfolding over its last two thirds like a home spawn; a finished remote crewmate falls home along the same kind of path, accelerating, and its packets ride the live line as at home.
Each takes longer the farther it flies (`REMOTE_TRIP`, `remoteTripMs`): the home clip's time over the distance a home spark covers, 147 px, and 280 ms more at 320 px, so a spark takes about a second across the stage; the fall home and a packet add the same extra over their own base.
The home spawn's numbers do not change.
A remote send-off or steer cue carries a unit direction, so the first mate glances toward the cluster.

**The black hole stays at home.**
Remote clusters receive a rush level of zero: their crew keep their pace and show no streak while the home crew race, since a cluster orbits its own center, out of the first mate's pull ("The black hole's rush" below).

**The warps stay at home too.**
A remote cluster's orbit never takes a warp: its crew keep their own group and pace while the home crew ride ("The warps" below).
Nor does a supernova's kick reach a remote cluster ("The supernova" below).

**Placement arrives with the row.**
The core creates a placed task's row with its computer in the same write (`CreateTaskInput.deviceId`), so the row's first `task_changed` already carries `executionDeviceId` and the crewmate spawns on its own cluster.
A placement that still arrives after the spawn - an older home, or a moved task - takes the crewmate off the orbit it was on at once (`CrewOrbit.discard`: no departure, and no settled snap of the others, who re-space on their springs) and spawns it on the right one, still as a spark if it was one.

The existing painter, solids, working/idle colors, review cues, request flickers, summaries and task-record interactions remain the owners.
Spawns, reports, steers and home departures connect to the one first mate, not to a remote invisible character.

`ComputerOrbits` (`character/crew/computers.ts`) retains the original home orbit and adds remote adaptive orbits behind the existing `CrewOrbit` painter.
The original adaptive orbit remains the unchanged single-computer rendering path, including character size, placement, motion, expressions, model names, empty state, its 560 px formation and its fit.
A control-only device contributes no cluster; a device explicitly known to be another user on this Mac shares the home cluster.
The task board and `task_changed` carry `executionDeviceId`, the task's actual execution placement, with null meaning home.
Names and the project's current Runs on never determine identity.
A paired view of an older home that has not published placement keeps the existing stage rather than inventing groups; clustering begins once the home supplies those facts.
An unreachable peer remains configured, so it never collapses a multi-computer scene into the single-computer path.
Its last painted crew positions and spin freeze, with cool dim solids and a line under its name; current activity, packets and animated review cues are not guessed.
That line says why it is away with the word Devices uses (`awayWord`, `docs/devices.md` "Updating"): Updating while its update is followed, Connecting while its connection is being made, both in the name's quiet color, and Out of reach in the warning color otherwise (`tests/browser/crew-remote-away.test.tsx`).
A removed computer that still owns active work keeps an unavailable cluster until those tasks leave.

Each page shows home and at most five other computers, without limiting tasks or computers.
Previous computers and Next computers are Tab-reachable controls; Previous work computers and Next work computers are commands in command search, with no default shortcut.
Every crew glyph on the page remains keyboard-inspectable even when model names are hidden or unassigned.
Enter opens its existing task record; Esc releases the summary.
All clusters and their controls hide with the character frame under cards.
`computers.test.ts` holds single-computer frame equivalence, local capacities, identity, same-Mac grouping, frozen uncertainty, paging, reviews, directed lifecycle effects, and the stage's rules: the wings' seats and the scene's reach, a seat's glide, the rush boundary, the remote spark's path and trip, the fall home's and a packet's trip, the unit cue, and a late placement.
`tests/e2e/computer-clusters.spec.ts` drives actual saved placement through boot, keyboard inspection and record opening, minimum-width fitting and overflow paging, with every remote crewmate clear of the home crew and, at the minimum width, inside the window.
`src/renderer/src/character/crew/computers.test.ts` holds the single-computer boundary: one computer draws the stage it drew before, with no names or paging.

## Visible seats

On desktop, iPhone and iPad, each main orbit spaces only the occupants drawn on it (INF-1375, approved A: keep small circles and close the gaps).
A crewmate on a relationship circle or program ring keeps its logical orbit membership for allocation, capacity and radius, but takes no angular seat there.
A visible program ring remains a first-orbit occupant.
A fallback crewmate drawn on its main orbit participates in that orbit's spacing.
Each orbit preserves its survivors' circular order and turns their spacing as little as possible; a return enters the widest visible gap instead of restoring a reservation.
Existing easing carries the changed seats, and Reduce Motion resolves placement and any circle fallback in one settled frame.
Resolution keeps a companion group that cannot circle (a member not yet on its orbit, or a fixed star among them) on its main orbit for the remainder of that frame, so closing a gap cannot cause repeated circle/fallback attempts in one frame.
The desktop's `offMain` set and the phone's drawing seat books carry resolved drawing occupancy, separately from logical crew counts.
Tilt, speed, orbit growth, computer grouping, program rings, inspection and arrows remain unchanged; equal angles still project to unequal screen distances.
No guide, ghost marker, label or setting is added.

## Active adversarial review cue

A host-commissioned review task identifies the builder through its fixed parent edge and its `shape.kind = review`.
The task board and `task_changed` stream carry that typed `reviewOf` id; an ordinary child cannot trigger the cue.
While the review task remains active (including an idle reviewer awaiting a re-review), the reviewer crewmate itself circles the builder it reviews, on the same circle a waiting crewmate uses ("Waiting on another crewmate" below): 64 scene pixels, 24 degrees per second, spanned by the builder's radial spoke and its main plane's normal.
Besides the reviewer's own arrow (below), nothing else is drawn around the builder; the review has no electrons.
The reviewer keeps its own solid, label, working/idle color and logical orbit membership, but reserves no angular space on the main orbit while circling.
The circle ends as soon as the review closes or the builder departs.
Closing the review closes the reviewer's task, so the reviewer takes its existing departure.
Its offset eases out on the springs over the fall, so it leaves from the seat it was drawn at and glides to its normal path; reduced motion settles at once.
Restart seeds the same relationship from the live board, and two reviews of one builder do not cancel each other when one ends: the other keeps circling.
`withReviewCues` in `companions.ts` turns each live review into a satellite cue beside the recorded waits.
The host records no edge from a review onto its builder (INF-1876), so the builder never orbits its own reviewer or points an arrow at it; the orbit layer drops such an edge all the same, the way an earlier release recorded one.
A real dependency keeps its place, and reviewers and waiting crewmates of one builder share up to three seats.
More than three, a builder that is itself a satellite, or a reviewer not yet on its orbit keeps the reviewer on its slot; wherever the builder sits, the circle keeps its full size ("Waiting on another crewmate" below).
Circling or on its slot, the reviewer draws an arrow to the builder at all times, the way a waiting crewmate does ("Waiting on another crewmate" below), in the working ember (`--wire-hot`) rather than the gray (captain, INF-556: "for a reviewer relationship, it should use the orange color that we use as active").
Like a waiting crewmate, it keeps circling when other crew pass close to it.
A reviewer and builder on different computers stay where they are, because each computer's orbit holds only its own crew; the reviewer's arrow still crosses the stage to the builder (captain, INF-556: "the same reach as waits"), drawn by `ComputerOrbits` beside each computer's own arrows.
The reviewer's summary names the relation in every placement: a Reviewing row with the builder's key, opening its record, beside any Blocked by row.
Packets and a steer's send-off aim at where the reviewer is drawn, circle included.
The circle is always 64 scene pixels, even when it crosses the first mate; the captain chose that overlap, so no clearance rule keeps it off the first mate (INF-51).
Reduced motion paints one settled frame.

`crewSignal.test.ts` checks the live review start/close, the board's own hold, departure on close, packets and send-off, unrelated children, a reviewer of an absent builder, the three seats and the slot fallback with every reviewer's arrow, settled frames and boot; `computers.test.ts` checks a reviewer on a remote computer, another computer's reviewer and its arrow across, waits across computers that move nobody, the builder's hold on a remote reviewer drawing nothing, two reviews, mixed companions with their arrows, and a waiting crewmate and a reviewer that keep their circles and their arrows through a minute of other crew passing close.

## A task with parts

A task that runs a program the host runs (`shape.program`, `docs/programs.md`) draws as moons, the captain's INF-5365 choice among the prototyped looks: its running parts circle its mark on a tilted ring, and a gem inside the mark gains wires as parts finish.
The settings the captain staged on that preview live in `CONSTELLATION` (`constellation.ts`): a first ring of at least 40 px tilted 40 degrees, turning 26 degrees a second, a second ring past ten parts, and a faint ring line.
`scripts/generate-phone-scene.ts` carries every number of it, and the gem's wire order, to the iPhone and iPad.
It draws only the program's running parts, each as its crewmate on a ring (INF-1037, the captain: "i feel 'not started' and 'finished' parts should not be rendered there").
A finished or unstarted part draws nothing, and the ring's summary counts them.
`constellation.ts` reads it from the board alone (`programsOf`): a parent the board marks as a program (`TaskView.program`) with work children.
A host-commissioned review is the builder's cue and never a part, and nothing is inferred from a title, an order or a script.
Any other parent, such as a task that only holds a plan and its build, or one with a crewmate of its own, draws no program, and its children orbit as single crewmates (INF-999).
A home that sends no `program` draws no program on a newer view (`src/shared/contract-changes/task-program.md`).

The mark is a small hollow ring with a seat of its own on the first orbit, the one a lone crewmate takes, so it never jumps when the second opens (INF-999, INF-1179): the first orbit's spacing counts each mark as an occupant beside its crewmates, so a program first draws at the widest gap, a newcomer enters at the widest gap among crew and marks, and every seat re-spaces evenly as programs come and go, each mark gliding on a spring to its new seat.
With several work computers a program draws a copy of its mark in the group of each computer that runs its parts, each copy with the crewmates running there (INF-1037, the captain's choice A), so every crewmate stays where its work runs.
Each copy's gem shows the whole program's share finished, read where the program's parts are all known.
A computer's copy goes once its parts there finish; with none running anywhere, between stages, the marks stay where they were drawn, or one draws at home.
Every copy is the same task: pointing at either opens its summary beside it, and the keyboard reaches one (`programMarks`, `markOf`).
`constellation.test.ts` holds two marks of different tasks on the first orbit more than a glyph's width apart at boot, for a minute of frames, and through a newcomer and a new program; crew on the other planes cross it on screen by design.

`moonRings` gives up to ten running parts one ring, and more two, the first holding the odd one.
A ring's radius is at least 40 px, wide enough for 30 px of arc a part, and a second ring sits at least 26 px past the first, tilted 18 degrees less on a different line of nodes.
`layoutProgram` places the parts in the order filed, evenly round their ring, the first ring turning one way and the second the other, so the running crewmates stay apart without a fan to widen.
A remote computer's group draws at half the scene's size with its glyphs at nearly full size, so its layout asks for the same room on screen.
The rings keep their full size wherever the mark rides, so a part may pass beyond the window's edge or over another computer's crew.
A part on the near half of its ring draws in front of the mark and its line brighter, 0.3 against 0.13 in the quiet color, 1 px.
A live part's crewmate keeps its spark, solid, heat, label, summary and departure; once it has arrived it glides to its place on the springs a waiting crewmate's circle uses, without reserving angular space on the main orbit.
A seated part never circles a blocker, and every wait arrow it has stays, to another part or a task outside its parent, so the arrows into a busy blocker count every live waiter.

The gem is the high tier's icosahedron, 10 px, turning half a radian a second inside the mark.
It has one wire for each thirtieth of the program finished, at least one, in an order that closes faces as it grows (`GEM_WIRES`), and is whole when the program is done.
A part's report is its result: its packet flies straight from its crewmate to the mark instead of to the first mate, and the mark lights as it lands, the newest wire white-hot for a moment; a part that has just finished starts its packet from its crewmate as it leaves.
The parent's own report, when it has no crewmate here, is a packet from the mark into the first mate.
When the parent closes done its rings fold into the mark over the fall home's time, the gem whole, and the mark then falls into the first mate as the one result home; a dropped parent fades where it stands.
A program first draws once one of its parts is underway, and keeps the planes while its next parts are filed.
Reduced motion paints one settled frame, the rings at their start and the gem still, and the pointer's slowdown and pause apply as to every crewmate.
Every mark names its task (`marks.ts`, INF-999): the mark is pointed at, summarised and opened as a crewmate is, and has a button of its own (`data-crew-mark`) the keyboard reaches, so nothing painted is a mark without a name.
A part's summary carries a Part of row naming its program's key, which opens the program's record.
The mark's summary carries the program's parts (INF-1037, the captain: "Add a row such as '20 finished, 5 running, 0 waiting' when pointing at the ring" and "make the hover preview for a ring a bit richer than just the counts"): a Parts row with the count of each state (`programProgress`, `partsCountWords`), one bar with each state's share, and a Running row naming each running part by its key, which opens its record, with the computer it runs on as its Tasks row says it.
A dropped part counts in none.
The near crew canvas publishes each program's ring count and gem share as `data-constellation` and the parts circling it as `data-constellation-crew`, compare-before-write.
`constellation.test.ts` checks the program read from a board, the rings and their room between crewmates, the seats, the packets, the gem, the fold home, the settled frame and the summary's counts; `computers.test.ts` checks a mark on each of two computers with only its own crewmates and the whole program's gem, a mark kept between stages, and pointing at either copy; `tests/e2e/program-constellation.spec.ts` seeds a review program beside an umbrella task that draws none, reads its ring and gem off the painted stage, and reads a part's Part of row and the mark's own summary with its counts and running keys, and `tests/e2e/crew-board-delta.spec.ts` links two running parts above the delta trigger and reads the arrow between them.
The phone's `PhoneSceneRosterTests` compares each running part's place on the ring to the desktop's `layoutProgram`.

## Tier solids

Each crewmate's solid is the intelligence slot it is served on (captain's board verdict, 2026-09-23; rules in the design skill's `components/mate/Crewmate.prompt.md`):

| Slot | Solid | Corners | Wires |
| --- | --- | ---: | ---: |
| low | tetrahedron | 4 | 6 |
| medium | octahedron | 6 | 12 |
| high | icosahedron | 12 | 30 |
| premium | geodesic sphere (the icosahedron, each face split in four) | 42 | 120 |

Every solid is inscribed in the same sphere, so the glyph size, the ring, the planes and every motion are unchanged; denser solids draw finer.
The slot is `TaskView.tier` - the newest routing decision's `served` slot (the asked slot on a row routed before `served` was recorded) - and rides `task_changed` so a re-route moves the solid live.
A crewmate whose slot is unknown (it never routed) is the tetrahedron, pixel-identical to the pre-tier crewmate.
The flicker, the filament tick and reduced motion apply to every solid's own wires; `crewmate.ts` owns the geometry (`TIER_SOLIDS`).

## Waiting on another crewmate

An idle dependency wait with one visible blocker on the same computer orbits that blocker.
The circle is 64 scene pixels from the blocker, before the stage's existing fit, and travels at 24 degrees per second on the stage clock.
It is spanned by the blocker's radial spoke and the main plane's normal, so the planes stay at 90 degrees and the spoke turns with the blocker.
At most three companions share that circle.
The circle keeps its full 64 scene pixels wherever the blocker sits, so it may pass beyond the window's edge or over another computer's crew (captain, INF-5726, which replaced INF-1532's shrinking circle); a waiter never drops back to its main orbit for part of a loop.
A chain, more than one blocker, or a larger group keeps its slot instead.
A chain is a crewmate waiting on the waiter: queued work that waits on it has no crewmate, so it makes no chain and the waiter still circles (INF-38).
Circling or on its slot, a waiting crewmate draws a quiet arrow to its blocker at all times, arrowhead at the blocker (captain, INF-304: the arrows "should be present at all times to make it more clear there's a relationship").
The arrow keeps clear of both glyphs; as the two close in on screen, such as when the circle passes in front of the blocker, that clearance gives way so a short arrow still shows (`drawDependencyLink`).
Crew pass close to one another and cross freely: nothing moves a circling crewmate back to its slot because another crewmate comes near (captain, INF-304: "we should just not care about collision").
Each kind of relationship has its own color (captain, INF-556): a wait's arrow is 1 px at 0.28 of the quiet gray (`--fg-3`) and a review's is the same strength in the working ember (`--wire-hot`); pointing at or focusing either crewmate lights the arrow at 0.7 and 1.4 px, a wait in the accent and a review still in the ember.
A blocker on another computer keeps its slot there and the waiter keeps its own: the wait is a solid gray arrow across the stage to it, like every other wait (captain's INF-556 choice, "Solid gray, like every other wait"; `crewedWaits` feeds `ComputerOrbits`).
A builder's merge hold on its own reviewer on another computer draws no arrow back, as on one computer.
A missing blocker, or one with no crewmate yet (a queued task), is named in the summary and draws no arrow.
No crewmate is invented, and no one is moved onto another computer.
Continuing, paused and unknown work keep their slots.
The stage draws no words for a wait beneath a crewmate (captain, INF-38: "the center animation should be kept as clean as possible"): its task tile and its summary name the wait, and its Tasks row says `waiting` (the design skill's NowPanel, "Naming a wait").
The solid, label, computer and logical orbit membership stay unchanged; angular spacing counts only occupants drawn on the main orbit.
Clearing the wait removes the cue and inserts a visible seat in the widest gap on its original orbit; the existing springs glide the offset home.
Reduced motion paints one settled frame.
Inspecting a Tasks row does not pause the stage.
`dependencyVisual.ts` is the one projection both surfaces read.
The near crew canvas publishes each arrow it draws as `data-crew-arrows`, `wait:<waiter>><blocker>` or `review:<reviewer>><builder>`, compare-before-write.
`crewmate.test.ts` checks each kind's color at rest and lit; `tests/e2e/computer-clusters.spec.ts` reads a wait's gray and a review's ember off the painted stage between two computers, and `tests/e2e/crew-board-delta.spec.ts` reads a wait's arrow appear and clear above the delta trigger.
`satellites.ts` owns the circle.
The Tasks gutter is specified in the design skill's NowPanel.

## The project focus

While the window is focused on one project, or a pointer or the keyboard rests on a project's pill in the top bar's open row, every crewmate of another project drops to a quarter of its light (`OUT_OF_FOCUS_LIGHT`, the captain's staged level on INF-1091), and its model name and state word with it (`docs/project-focus.md`).
A crewmate keeps its slot, plane, speed, colour and solid: nothing hides and nothing moves for the focus.
The light eases over `--dur-med` each way and is a cut under reduced motion, where the stage repaints once for the change.
A crewmate whose project the board does not name stays lit.
While a crewmate's summary is open, from a pointer rest or its focused name, the stage lights that crewmate's project on every computer the same way, in place of the window's own light (INF-6951, `restedLight`); a program mark's summary lights its program's project.
The light follows the summary, not the pointer, so it changes after the summary's beat and a sweep across the crew does not flicker; leaving, Esc or a press puts back the held focus, a pill's rest or no light.
A crewmate whose project the board does not name leaves the window's light as it is, and a Tasks row or an Activity line lighting a crewmate (its brackets) lights no project.
The phone's crew scene draws the same light from the same value (`docs/ios.md`).
The light is the last thing the orbit's frame passes through before it is painted (`lightFrame`, `src/renderer/src/character/crew/focusLight.ts`), so every painter and label reads the same alpha.

## Verification

- `orbitalPlanes.test.ts`: the staged two orbits' geometry and signed rates from the captain's settings, measured travel of rendered frames, the first orbit's growth a notch per arrival, its widening on the springs, depth/radius/bounds, the second orbit's opening at 25 and packing through 96, outward refills, the inner orbit's shrinking and closing, churn, stable survivors, packets/cues and reduced motion.
- `tests/browser/crew-planes.test.tsx`: 48 idle crew seeded through the core's own task store, booted by a real core, at the smallest window: all on the stage, the crowded orbit inside the window and clear of the prompt as the crew are placed and once the planes have opened out, and a crewmate's summary still opens whole in the window.
  It reads the board the window's first read brings, with no push after it, so it fails if that read is dropped (INF-2526).
- The `orbit`, `crewSignal`, painter/cue and crew ring browser tests exercise the unchanged lifecycle, commissioning, solids, posture and review cues.
  Each crew ring case in the browser layer (`tests/browser/crew-orbit-*.test.ts`, helpers in `tests/browser/crewOrbit.ts`) opens its own window on a fresh home with no crew, then replays the pushes the core sent as one idle crewmate went out and, for cancellation, as it was dropped (`crewStory`, `docs/testing.md` "The browser layer").
  Under reduced motion the arriving crewmate holds one still frame across 30 drawing frames.
  The display case stays a journey, `tests/e2e/crew-orbit.spec.ts`, since Chromium tells only a top-level page that the display density changed: it moves a reduced-motion ring to a display of twice the density and back with a device-metrics override, each layer keeps one backing pixel per device pixel, and the second visit shows the very picture of the first.
  Run it alone with `pnpm exec playwright test tests/e2e/crew-orbit.spec.ts --project=renderer --no-deps`.
  The journey attaches fresh board/count/pixel state and lifecycle pictures; sample captures are local evidence and are not committed.

No playground controls or generated card bundle are imported into production.

## Continuing-work posture

Tasks dots, home-view crew heat/spin, and the working/idle counts read one host-derived `workPosture` from the task board and `task_changed` events.
It is presentation only: `activity`, turn control, the idle clock and the supervision witness order are unchanged.
One reader beside the board: the quiet check refresh skips a task whose posture reads idle behind another task (`docs/forge.md`, "The check watch").
The card-thread Working badge still reads turn activity.

Active means a running turn, a live host/client job, watched checks, deliverable guidance (including retry backoff or a captured captain reply), captured settlement, or a finite automatic wait.
A quiet upstream contribution with the same open pull request and a confirmed published story at its current version stays watched but reads idle, retaining Waiting for the maintainers.
A real check or run watch, pending batch, running turn, job, settlement, actionable author guidance or owned finite automatic wait takes precedence over that external wait.
The collapsed Tasks summary and project pills use the same quiet-wait exclusion without moving or hiding the task.
This presentation changes neither session ownership nor placement reservations or admission.
A decision card does not cool a worker while evidenced work continues.
Host jobs remain active past their two-hour inspection bound; that bound remains a supervision rule, not proof of exit.
An account cut-off or quota gate pauses queued delivery.
A question with no continuing work and a dependency with no continuation are idle.
Paused/unknown postures stay cool; the Tasks dot's tooltip carries the reason.

A background wait is working with a look of its own (captain's INF-676 direction A and INF-1777 plan): waiting on its checks (posture active, reason `checks`: a watched pull request's checks or a hand-started run), or on local work it left running (reason `job`: a host job, a heavy run on a computer, or the Claude client's background list).
On the stage the crewmate stays counted among the working but banks: idle strength (0.6) and idle pace, no filament tick, no halo, sitting at the idle radius, inside a thin dashed cyan ring at 0.8 of the glyph, twelve dashes, whose brighter arc travels round at 1.6 radians a second, the fact strip's running-checks mark carried onto the stage.
The dashes keep the ring apart from the beacon's full ring below.
Its wires say where the wait is: ember for local work, because the crew is still somewhat active here, and ice cyan for checks, because the wait is outside; local work outranks checks, as the posture already ranks it.
It eases in and out on the working blend's own ease, the wires easing between the two colors while the ring stays, and heats back to full ember the moment a turn runs; reduced motion draws the dashed ring whole and still.
`WAIT_LIGHT` in `crewmate.ts` and `WAIT_ARC_RATE` in `orbit.ts` own the numbers, and `scripts/generate-phone-scene.ts` carries them to the phone's painter as `wait`.
The shared mark draws it as a dot inside a dashed accent ring, the accent for checks and ember for local work, still reading `Working · Waiting for checks` or `Working · Background work continues`, and a checks row adds the dim word `checks`.
`crewSignal.test.ts` and `crewmate.test.ts` check the stage look, `tests/e2e/task-wait-reason.spec.ts` reads the checks ring off the painted stage and the mark off the row and the record, `tests/e2e/work-posture.spec.ts` reads the background command's ember ring, and `PhoneSceneRosterTests` checks the phone's two waits.
Interrupted turns retain the danger dot unless continuing work is known.

Waiting on the captain has a look of its own too, the beacon (captain's INF-1543 direction A, with the settings chosen in its preview).
The one fact is the Tasks panel's: a crewmate whose task sits under Waiting on you (`nowGroupOf`), a ready decision, a required action or a put-aside card, wears it, whatever its posture says; on iPhone and iPad it is the phone's own Waiting on you group.
The stage keeps it working or idle as its posture says and adds the row's ring: a thin accent circle at 0.9 of the glyph, 1.2 px, under a soft accent halo at 0.12 reaching 1.3 times the glyph, breathing once every 3.2 seconds between 0.25 and 0.85 of the accent with a 6% swell, its wires held at idle strength (0.55).
The breath starts at its faintest when the wait begins, so nothing flashes on; the blend eases in and out on the working blend's ease, and reduced motion draws the ring whole and still at mid light.
`CAPTAIN_LIGHT` in `crewmate.ts` and `CAPTAIN_BREATH_MS` in `orbit.ts` own the numbers, and `scripts/generate-phone-scene.ts` carries them to the phone's painter (`PhoneCrewPainter.swift`) as `captain`.
`crewSignal.test.ts` and `crewmate.test.ts` check the stage look, `tests/e2e/task-wait-reason.spec.ts` reads the ring's spread off the painted stage, and `PhoneSceneRosterTests` checks the phone's waiting crewmate and photographs its beacon in both themes.

The host refreshes sequenced presentation changes after job membership, inbox, card/thread, account cut-off and task events, with reconciliation on the existing ticker.
Only active work has a live posture, so its facts are gathered for active rows alone, and the refresh walks only live rows: a closed row's posture changes only with the write that closed it (`deriveWorkPosture`, `TaskProtocol.refreshPresentation`).
One pass reads each live row's posture once, and the crew counts it announces reuse those readings (`WorkPresentation`, INF-1073).
The pass's own effects ask for no further pass: its republish write changes no posture (`TaskChange.republish`), and its own counts event is not a crew change.
Any other write or crew change, including one made while the pass runs, asks for the next pass; `workPresentation.test.ts` counts the passes and readings per change.
The pass stops with the core, so a write that lands after the quit, such as a background job's exit or a closed task's temporary-folder sweep, runs none (`core.wiring.test.ts`).
Boot derives the same answer; persisted job rows are history, not live jobs.
Claude's complete background list replaces membership on each signal.
Attachment/transport loss invalidates the previous membership.
Until the installed client supplies a valid list, absence of background work is unknown (the current SDK emits no startup list).
This does not change recovery or assume every installed client supports that signal.

## Model-name labels

Captain-approved after the playable prototype: the current model name follows each crewmate’s painted frame, 4 px above its glyph sphere, in secondary 11 px text with a 128 px maximum width.
It follows the sequenced task board (including reroutes) and the available catalog, including by-name offerings.
An unknown model falls back to its ID; before assignment the label stays empty (captain: “when it's not assigned yet, just leave it empty”).
Known OpenRouter maker prefixes are removed for display by the namespace-keyed exact map in `src/shared/modelDisplayName.ts`.
Unknown/custom labels remain unchanged; catalog labels, provider/model identity and routing are untouched.

Labels show only while exactly one orbit is active and it holds eight crew or fewer (captain, INF-1179: "Show names only while the single orbit has eight crew or fewer, as today"), since the growing ring seats up to 24 on one orbit.
A ninth crewmate or a second occupied orbit hides all labels; returning to eight on one orbit restores them only if the Settings switch remains on.
This reads the painted frames' occupied planes and the crew on them (`CREW_NAMES_UP_TO`), and excludes departing crew.
Empty rosters show no names.

A name fades in by opacity alone over `--dur-med` with `--ease-out` each time it shows: a model assigned while its crewmate orbits, a reroute's new name, the return from two orbits to one, the switch turned on, and every time the stage is drawn again (at launch and back from Settings).
Under reduced motion it keeps an even `--dur-fade`, like the state word; hiding is immediate (captain, FI3-843: "a quick fade in - consistent with our other transitions").
Labels narrow at the canvas edge and ellipsize, never shrink the type.
The formation’s fit is countered for the text so it remains 11 px even at the minimum window height.
A name is part of its crewmate: pointing at it, or focusing it from the keyboard, opens that crewmate's summary - which carries the complete display name - and pauses the stage like pointing at the crewmate itself; a click or Enter opens its task record, and Esc lets it go.
The separate full-name plate under the formation is gone (captain, FI3-398: "fold it in").
The formation and choreography do not change for the labels.
Labels hide with the character’s mounted, inert frame behind cards and do not take focus there.
The last turn above the input is separate (`docs/composer.md` "The last turn").

Settings → Appearance → Crew model names is on by default, also on older installs, and writes the existing core-owned appearance record through ShellPreferencesService.
Automatic orbit visibility never changes that stored choice.
The switch takes effect at once and survives a restart with a fresh window profile; theme and wash writes preserve the choice.

A crewmate's state word ("Working" while ember, "Idle" once cyan) is a second line on the same anchors, 4 px under the solid, drawn for someone new until each word has been seen in full (docs/first-launch.md "The crewmate's state words").
It reads these frames - only phase `orbiting` with the working blend settled - and follows every orbit, whether or not model names show.
It hides with the character's frame behind cards, hides while its crewmate's summary is open, and never changes a color, a motion or a summary.

`tests/e2e/crew-model-labels.spec.ts` verifies real catalog names, complete-name access through the summary (pointer and keyboard), default/on/off/restart behavior, unscaled text and bounds in both themes and narrow/roomy windows.
It also exercises live 8 → 9 → 8 transitions on the one orbit, removes hidden names from accessibility and inspection, and preserves manual off through both transitions.
The existing crew journey specs retain the motion, formation, lifecycle and tier checks.
Product captures are written by `crew-model-labels.spec.ts` into the run's own results folder.
No private prototype code is imported.

## Slowing near the pointer and the crewmate summary

Captain's ask (FI3-398, plan accepted 2026-10-01): "when user mouse move close to the main view's character + crew animations, the whole animation should slow down drastically, and allow user to mouse hover on each crewmate to see a small HUD-style summary for what the task is and what it's doing"; then "when mouse actually hover on a crewmate, let's pause the animation completely. also, avoid text wrapping in the small popover if possible. we can ellipsis".
It replaces the earlier rule that inspecting never pauses or changes the animation.

**One stage clock.**
`character/stageClock.ts` is the one time source for the character and the crew: stage time advances by real time times an eased rate, both animation loops read it (asking twice for one frame answers the same), and every stamp the stage animates is taken from it (`stageNow()`: the boot roster, crew events, the orbit's creation, the character's sim and a tap).
So the character's turning, crew travel and spin, spawns, departures, packets, nudges, flickers and emotes slow and stop together.
At rate 1 stage time is real time minus a constant
- bit-identical to the raw frame time until something first slows it - and at rate 0 it does not move.
  Theme re-reads and the pointer's rest stay on real time.

| Where the pointer is | Rate |
| --- | ---: |
| Away from the formation, absent, or nobody out | 1 |
| Inside the zone: over an occupied orbit, or within 28 px of its painted ellipse or of a crewmate | 0.1 |
| On a crewmate, or its name has the keyboard | 0 |

The zone follows the orbits the crew travel, not a circle around the stage (captain's ask INF-56, 2026-10-15: "right now it seems my mouse is nowhere near the animation but it would already trigger the slow motion").
Each frame the orbit model hands over its occupied orbits (`OrbitFrame.orbits`): one ellipse for each plane a crewmate that is not leaving is on or headed for, traced through the same ring-to-planes blend and projection as the crew, so another computer's cluster has its own orbits at its seat.
The zone is each of those ellipses with both semi-axes widened by 28 px, and 28 px round every crewmate there to point at, such as a reviewer circling off its orbit, in screen pixels after the formation's fit (`inCrewZone`, `crew/hover.ts`).
28 px is past the reach of the largest glyph, so the stage slows just before the pointer lands on a crewmate; the air above and below a flattened orbit, beyond the outermost one, and above and below another computer's cluster runs at full speed.
Every drop eases with a 0.11 s time constant (settled in about a third of a second) and every rise with 0.23 s (about 0.7 s), integrated exactly so the result does not depend on frame timing.
A pointer that rests inside the zone for 3 s, on no crewmate, lets the stage go; its next move slows it again.
A pointer resting on a crewmate holds the pause indefinitely.
The rate is 1 whenever the pointer leaves the window, the window loses focus or is hidden, the character's frame is hidden under a card or record, the view is not home, or the pointer is over something that is not the stage (a rail, the input, the top bar).
Reduced motion has no rate: its one settled frame is already still.
During a pause every structure stops, crew and character alike, but the first mate's eyes keep blinking and following the pointer on real time (captain: "the eyes still blink and follow").
The painted scene is stale by design while paused: a crewmate that arrives, reports or leaves meanwhile plays when the stage resumes.
While slowed, clips stretch (a spawn spark takes about 7 s at a tenth), and the order of events is preserved because they are stamped in stage time.
Typing or talking does not by itself cancel the slowdown or the pause.

**Pointing.**
The crew canvases ignore the pointer, so pointing is a hit test (`crew/hover.ts`, pure) against the frames the orbit already returns, run on pointer movement only: a crewmate drifting under a still pointer triggers neither the pause nor the summary.
The pointer is on a crewmate within half its glyph plus 8 px of its painted centre (never less than 18 px); the nearest wins, the one nearer the camera when equally near; it stays on that crewmate out to 1.6 times that radius, and a neighbour takes over only once the pointer has left the held one's own radius.
A departing crewmate, or a spark not yet unfolded, is not a target.
The near crew canvas publishes the crewmates that have arrived and orbit each plane, by task id, as `data-plane-crew`, and how far the planes have opened out as `data-plane-blend`, which reads `1` once they have settled in (both compare-before-write).
A part of a task with parts takes its seat at its node only once the planes have settled, and is listed on its plane until then.
So a journey's `pointAtCrewmate` waits for settled planes and the crewmate it wants, then points at a seated part's name or sweeps the orbit for any other crewmate.
The pause begins the moment a crewmate is acquired.
It ends when the pointer leaves it, on Esc (which keeps it closed until the pointer has left that crewmate), under a card, or when the crewmate itself is gone.
It works at every crew size and on both orbits, independent of the model-name switch; the sweep follows each orbit at the radius its crew give it (`planeRadius`).
A click on the crewmate being read calls the shell's `openRecord(taskId)` - the record its Tasks row opens - and is not a tap on the character behind it.

**The summary.**
One DOM panel (`crew/CrewSummary.tsx`, `crew/summary.css`), 130 ms after the pointer lands, in the captain's instrument look: corner brackets round the crewmate, a hairline to the panel, squarer corners, and an uppercase micro label in a side column beside each line (the captain's pick from the FI3-427 mocks, 2026-10-01).
The model, the task's Difficulty badge, then its pull request with its checks as one state and its time, sit in one row under a hairline, each value under its own label (INF-2528, the captain's direction B: "the preview should remain concise and only the most critical information. more details should be shown in the task card"); the reasoning, its footnote, the check counts and every wait's times are the record's alone.
Its lines are the shared task facts (FI3-565 piece 2, the design skill's NowPanel "Shared task facts"): one projection, `taskFactsOf` (`src/shared/taskFacts.ts`), drawn by one component (`design/core/TaskFacts.tsx`), which the task record shows too, so one task reads the same values on both; the record adds the details the summary leaves out.
The record places the fact strip just above its action bar, after its rows.
Once the record's read answers, the whole projection is that read's, the same one the record shows.

| Line | Content | Source |
| --- | --- | --- |
| first | task key, the shared status mark and word with its short reason, never a wait's recorded time, a lone wait naming where its line stops and that task's hold; wrapping when long | `tasks.board`, then `tasks.detail`: `taskStatusOf` |
| BLOCKED BY | each standing blocker's key; its recorded and end times are the record's | `tasks.board` `waits` (`dependency`), else `blockedBy` |
| TASK | the task's title, wrapping in full | `tasks.board`, then `tasks.detail` |
| PROJECT | the project's display name, wrapping, under Task; absent when the board has no name for it | the Tasks row's own lookup, `projectNameOf`: `tasks.board` `projects` by `projectId`, else empty |
| TAGS | the tags the task carries, by name, wrapping, under Project; absent when it carries none (`docs/task-tags.md`) | `tasks.board` `tags` |
| NOW | the crewmate's own newest doing - its own row, its newest action or its last sentence - and that doing's short age (`docs/task-record.md`, "The Now line") | `tasks.detail` `activityLog` and `said`, read only while that crewmate is pointed at, live while open |
| MODEL (strip) | the full model display name, ending in an ellipsis before the row would wrap; absent before assignment | the one model-name lookup (`modelNames`, `src/shared/modelDisplayName.ts`) the labels, the record and the core's `ModelSlots.nameOf` use |
| DIFFICULTY (strip) | how hard the task is, the level its routing asked for, as the `SlotBadge` Settings → Models draws it (Premium, Hard, Normal, Simple); the served level when the record cannot say; absent before routing | the routing decision's `asked` (`modelReason`), else `tasks.board` `tier`, the level the crewmate's solid shows |
| PULL REQUEST, REVIEW (strip) | the pull request (or branch) by its label as plain text, then its checks as the merge card's dot and one state with how long they have run or took (`running for 11m`, `passed in 14m`), and on a second row a review's verdict; absent until the task has a change or a checks reading, except that a task with no change shows the newest run it started by hand and the app watched in a CHECKS cell (`docs/forge.md`, "The checks cell's time") | `tasks.board` `delivery`, the state through `currentCheckState` (`not read for this version` for a reading of an earlier version) |
| Reasoning, footnote, check counts, watch schedules (record only) | the reasoning its session opened at, why it is lower than its level asks, every check state's count, a refusal's reason and each watch's next read; the summary never shows them (INF-2528) | `tasks.detail` `reasoning` (`docs/routing.md` "Reasoning effort"), `delivery`, `waits` |
| Why this model (record only) | a disclosure under the strip: why that model was chosen, how the allowance decided and the ranked models; the summary never shows it (INF-1714) | `tasks.detail` `modelReason` and `modelChoice` (`docs/routing.md` "Why this model on the task record") |

The status, the task title, the project and the tags wrap in full.
The other facts stay one line, the panel is as wide as its longest line up to 360 px, and a longer note ends in an ellipsis while the note's age stays whole at the panel's right edge.
360 px leaves every state the app can show whole beside its key (`crew-hover.spec.ts` checks that the shown state reads whole).
The strip's row never wraps: a value the record cannot say leaves no gap, and a long model name gives way first, down to its label's width, then a long branch name, each ending in an ellipsis inside its cell.
The status may wrap, to two lines at most, as may the task title and the project.
A cut-short line is not expanded in place; the record has the full text.
The panel sits beside the crewmate on the side away from the character, level with it; where that has no room, under or over it; and only then on the character's side.
It keeps inside the window between the top bar and the input, never under a rail's panel, and clear of the crewmate's own name.
If none of its preferred positions fits, it searches the remaining space along the panels' edges, keeping the same size and a hairline back to the crewmate.
When rail content leaves no clear place, the same summary, brackets and hairline use the window-wide layer above the rails, so sidebar rows never obscure the summary.
Only that no-room case may cover sidebar content; as soon as a clear place exists it returns to the ordinary layer.
Placement measures visible panels, the create-panel slot and the More row, and its coordinates stay physical in either text direction.
While a summary is open, its room source observes rail, control, top-bar and prompt geometry, including panel moves and newly mounted controls, independently of the animation clock.
Late panel resizing or folding repositions the same mounted summary under reduced motion without another pointer move.
It lives outside the fitted formation, so its type is never scaled, and it follows the painted crewmate with compare-before-write, so a paused stage with unchanged room touches no DOM.
It is read-only - no buttons - and never takes the pointer.
Under reduced motion the summary works against the still frame.

**From a Tasks row** (FI3-565 piece 3, the design skill's NowPanel "Row hover").
Resting on any Tasks row opens the same `CrewSummary` for that row's task, after the same beat (`CREW_HOVER.dwellMs`); a row the board no longer lists (the filter's `earlier` group) takes its first facts from the record's read instead.
The Tasks panel is a frame, so it reports the row it rests on with the panel API's `point.peekTask` and the row's box (`src/panels/now/panel.tsx`), and `null` when the pointer or the keyboard leaves that row, presses it, or Escs, or the list moves under the pointer.
The keyboard's rest goes with its row instead: a focused row that moves reports its new box, and one whose task moves to another group keeps focus and its summary there (INF-902).
Leaving any other row lets nothing go: focus leaving the row a click opened keeps the summary of the row the pointer rests on, so an Esc in the window then closes that summary and not the record the click opened.
The host adds the frame's offset and keeps the row in a small view-state store (`plugins/point/taskPeek.ts`); `plugins/point/PeekSummary.tsx` draws the summary in a window-wide layer above the rails and the cards.
A task board tile rests the same way from the board's card, and its summary sits beside the tile itself.
`placeRowSummary` (`crew/hover.ts`) puts it outside the Tasks panel on the stage's side, centred on the row, inside the window under the top bar and clear of the input and the other rail's panels (rising above what is in the way, then the other side), with the hairline from the panel's edge at the row's middle; there are no brackets.
The host also lets it go when the pointer moves anywhere outside the frame, on Esc (which then goes no further, so a record open under the summary stays), a scroll that carries the frame, a resize or the window losing focus.
A scroll carries the frame only if what scrolled stands scrolled elsewhere than when the host measured the box: the window hears a scroll at its next frame, so a row or key the keyboard brought into view can report itself, already in its new place, before the scroll that brought it there (INF-1154).
Nor does a scroll carry the frame unless the frame moved with it: the stage easing into place moves the frame with nothing scrolled, and a scroll heard late would read that move as its own; and a scroller that grows upward while scrolled to its end, such as the Tasks panel's body when a panel above it shrinks, has its scroll pulled back by as much, so the frame and the row stay under the pointer.
A move the window receives aimed at the frame element itself is not outside it: Chromium sends one as the pointer crosses into the frame, often just after the frame has reported the row, and the frame never reports that row again.
The pointer leaving the window lets it go too, heard as the window document's `pointerleave`: macOS hands Chromium's exit to the window's own page alone, so a frame under the pointer never hears it and never reports `null`.
It never inspects a crewmate and never slows the stage; the lit task below puts brackets on that task's crewmate, and nothing else.

**From a feed line** (INF-1761, approved INF-1759 direction A).

Every Activity line opens a read-only line summary on rest, including the newest line in the collapsed header.
The panel sends `point.peekLine` with its recorded `feed.recent` line and box; the host checks the line against the feed it presented and places it through the same `taskPeek` store and `PeekSummary` layer as a Tasks row.
`LineSummary` reads the recorded words in full, the kind dot and exact local time, then the task's title and project where the board or a task search knows it.
A task-less line has no task fact rows, and an unknown task keeps its recorded key alone.
The summary reuses the task summary's panel, beat, hairline, placement, width and motion; it lights its task but never pauses the stage.
Leaving, Esc, a press, scrolling, resizing or losing window focus closes it; after Esc or a press the same line stays quiet until the pointer leaves it.
Keys keep their own task summaries and clicks, and the list keeps its existing keyboard model: focus wraps every line and the arrows scroll it.
The collapsed header shows the line summary on keyboard focus too.
`tests/e2e/activity-line-preview.spec.ts` drives the line, short-line, key and collapsed-header journeys, while `point/linePeek.test.ts` owns recorded-line validation and read grants.

**The lit task** (INF-237, "hover a task anywhere, highlight it everywhere").
A rest on a task on any surface lights it on every surface that shows it.
`plugins/point/litTask.ts` is a second small window-view store beside `taskPeek`: `{ taskId, by }` or none, one at a time, the last rest winning, and a source lets go only of what it lit.
`taskPeek.set` and `taskPeek.release` feed it, so every Tasks row, board tile, panel key, card-frame key and window key publishes with no change of its own; `CrewOrbit` feeds it the crewmate it inspects (a pointer rest or a focused name, `by: "stage"`) and lets go when it stops inspecting.
It is lit the instant a rest begins and cleared the instant it ends, with no beat; the summary keeps its own 130 ms.
The stage follows it with the corner brackets alone: for a lit crewmate that is not the one it inspects, `CrewOrbit` draws the `.fm-crew-target` brackets round the painted crewmate (`placeLit`, per frame with compare-before-write, and once under reduced motion) and sets `data-crew-lit` on the formation.
There is no summary, no hairline, no pause and no slowing: `data-stage-rate` and the stage clock are untouched, as the 2026-10-01 ruling says a row's rest never moves the stage.
A lit task that is no crewmate here, or whose crewmate is leaving, draws nothing.
Its other followers are the Tasks row (`data-now-lit`), the board tile (`data-board-lit`), a panel's keys (`PanelView.litTaskId`), a card body's or record's keys (`data-inf-lit`, `docs/ui-plugins.md` "Pointing and the view") and the keys the window draws (`data-task-lit`).
Nothing is scrolled or paged into view: a lit row lights where it is.
It is window view state: nothing is saved and nothing crosses IPC.

**From a task key** (FI3-594, FI3-1271; the design skill's core rule "Task keys").
A card body's or a task record's frame reports the key it rests on (`cards/taskLinks.ts`), and a key the window draws - a thread line, a card's title, the record's Now line, a Settings row - reports itself (`cards/TaskKey.tsx`, an `AnchorPeek`); the same store and layer show the same summary for that key's task.
`placeKeySummary` (`crew/hover.ts`) puts it beside the card, or the Settings section, the way a row's sits beside its panel, level with the key and with the hairline from the card's edge on the key's line, or under the key's line (then over it) where neither side has room.
A key in a panel - Activity, Knowledge - points as a Tasks row does (`point.peekTask`), so its summary sits beside the panel.
The same window rules let it go, and also any other key press in the window, the card's frame leaving the window, the frame taking a new document, and a window key leaving the window.
`tests/e2e/card-task-keys.spec.ts` drives it: the key's summary reads the same facts as its Tasks row's, clear of the key and input in roomy and narrow windows, a slide into the key from either side of the card with the synthetic mouse opens it, and a key in a record, a thread line, Activity and Settings › Usage rests and opens the same way.

`stageClock.test.ts` covers the clock (bit-identical at rest, one answer per frame, the two easing constants, an exactly still stage at rate 0, the exact integral, stamps between frames, the rate rules); `crew/hover.test.ts` the zone on the orbit model's own frames (each orbit's shape, every crewmate's reach at every crew size, a reviewer off its orbit, the fit, the glide into the planes, other computers' clusters), the hit test's acquire/stick/release radii and preferences, and the summary's placement beside a crewmate and beside a Tasks row; `crew/useCrewBoard.test.ts` the summary's facts, `src/shared/taskFacts.test.ts` the shared projection and `design/core/TaskFacts.test.tsx` that the summary and the record show the same values, with the record's model readout after its rows.
`tests/e2e/crew-hover.spec.ts` drives the real home view: pointing opens the summary, Esc closes it, a click opens the record, nothing opens under a card, and the summary and record show the same task facts.
Stage-clock rates and easing belong to `stageClock.test.ts`; summary placement journeys use `expectClearOf` from `tests/e2e/layout.ts` rather than asserting a side, gap or hairline alignment.
Its second journey rests on a backlog, an idle and a done Tasks row: each opens its summary clear of the row and input inside the window, the idle row's matches the summary its crewmate opens on the stage, leaving, Esc and a press close it, the press still opens the record, and a row's summary reads over an open record.
Its third journey slides into a Tasks row from the stage on its left and from the panel's edge on its right with Chromium's own synthetic mouse (`launchApp({ gpuBenchmarking: true })`), because Playwright's mouse never sends the window that crossing move; each slide opens the row's summary.
The slow rate itself is `stageClock.test.ts`'s, and the summary's look is judged by eye.

## The black hole's rush

Captain's ask (2026-10-01): "when firstmate character is doing the blackhole fidget animation, it should drastically speed up all the orbital crewmates like crazy".
Built after the playable preview with the captain's tuned settings (Build it: `peakX` 36, `rampS` 1.6, `settleS` 2, spin and streaks on).

| Setting | Value | Where it counts from |
| --- | ---: | --- |
| Top speed of the crew's orbital travel | ×36 | |
| Ramp up | 1.6 s | the black hole's wind-up (0.28 s into its 5.6 s) |
| Settle back | 2.0 s | its unwind (4.48 s in), or the moment it is cut short |
| A crewmate's own spin | a quarter of the boost (×9.75 at the top) | |
| Speed streak | the arc swept in the last 0.06 s, at most 1.5 rad | |

Both ramps are smoothsteps, so the speed never jumps.
The character publishes its black hole to `crew/rush.ts`'s shared `crewRush` every frame it plays (the fidget's start in stage time, so a pinned emote moves the rush with it) and that it stopped; the orbit reads the level each frame (`CrewOrbit.update(now, settled, rush)`).
A black hole that ends on its own changes nothing, since the settle already began with the unwind; one cut short by attention or a turn starts the settle at once, from wherever the ramp had reached.
A rush still settling when the next black hole begins carries on from its level.

Only travel speeds up.
The extra travel is a lead on the orbit's own clock, and every angle spring moves with its target, so the crew race rigidly on their evenly spaced slots instead of trailing them.
Every orbit keeps its direction and relative pace, so the first (+8°/s) and second (−14°/s) orbits race in opposite directions.
Spawns, departures, packets, nudges, flickers and tiers keep their own pace, and the lead stays where the rush left it, so nothing jumps when it ends.
An orbiting crewmate trails a streak of its own light, lifted a quarter toward white-hot, along its own projected path, thinning and fading away from it (`drawCrewmate`).
The first mate's own black hole is untouched.
So are the other computers' clusters: their orbits receive a rush level of zero, since each orbits its own center out of the first mate's pull ("Multiple work computers" above).

The rush runs on stage time, so the pointer's slowdown and pause apply to it like everything else.
Reduced motion plays no black hole and no rush: the settled frame ignores the level.
The near crew canvas publishes the travel speed as `data-crew-travel` (1 except during a rush), compare-before-write.

`rush.test.ts` covers the schedule (ramp, hold, settle, a cut, a pinned clock, a new black hole mid-settle) and the streak's arc; `orbitalPlanes.test.ts` covers racing travel per orbit at ×36 on evenly spaced slots, the return to the normal pace, the spin share with an arrival unfolding on its usual schedule, streaks only while racing and behind the crewmate, and reduced motion; `crewmate.test.ts` the streak's paint under an unchanged solid; `computers.test.ts` the remote clusters' unchanged pace and absent streaks at the top of the rush.

## The warps

Captain's ask (INF-1750): "i want this fidget animation to look like the whole crew is traveling through space at warp speed like through a wormhole"; all three prototype treatments were chosen ("add all 3 actually"), and on who rides: "Only the crew circling the first mate.
Crewmates working on your other computers stay in their own groups, as they do during the black hole."

The character publishes the warp it plays to `crew/warp.ts`'s shared `crewWarp` every frame (its start in stage time, the first mate's radius and its ember) and that it stopped; the orbit reads the frame each frame (`CrewOrbit.update(now, settled, rush, warp)`), and so does the crew's far canvas, which paints the warp's backdrop under every crewmate.
Every warp lends the crew a lead on the orbit's clock, as the rush does (`WARP_LEAD` seconds of their own pace per unit of warp distance), so the crew travel faster on their evenly spaced slots and the lead stays where the warp leaves it.
The tunnel opens every orbit face-on and draws it in a little, and each rider trembles, comes in front and trails light outward; the sphere's riders dive into its wormhole one after another and come back out; the corkscrew's riders peel off into a spiral line behind the first mate, through the hourglass's throat.
Each of those moves is scaled by the warp's envelope and applied in screen space after a crewmate is seated, so at the end every crewmate is back on its own seat.
A rider is an orbiting crewmate not circling a program; spawns, departures and other computers' clusters keep their own motion.
A warp cut short by attention lets the crew go home over 0.6 s (`WARP_RELEASE_MS`).
Reduced motion plays no warp.
The near crew canvas publishes the warp it draws as `data-crew-warp`, compare-before-write, and its travel speed as `data-crew-travel`.

`crew/warp.test.ts` covers each warp's ride: the home crew move, the riders end on their own seats, a remote cluster keeps its pace, and a cut warp lets go; on the phone, `PhoneWarpTests` holds the same promises for its scene.

## The supernova

Captain's ask: "one more fidget animation added to the pool for the first mate character that's somewhat like a supernova explosion"; the approved preview reaches through the crew.
The character publishes the supernova it plays to `crew/supernova.ts`'s shared `crewSupernova` every frame (its start in stage time, the first mate's radius and its ember) and that it stopped; the orbit reads the frame each frame (`CrewOrbit.update(now, settled, rush, warp, supernova)`), and the crew's far canvas paints the blast under every crewmate.
The flash lights every rider at once, and the blast's front kicks each one straight out from the center as it passes, by up to `SUPERNOVA.crewKickPx` on a damped swing of about 0.75 s, weaker farther out; the swing ends on the crewmate's own seat, since it is applied in screen space after the crewmate is seated.
The riders are the warps' riders: orbiting crewmates not circling a program, never a fixed star or another computer's cluster.
A supernova cut short by attention lets the crew go home over a warp's release, 0.6 s.
Reduced motion plays no supernova.
The near crew canvas publishes the supernova it draws as `data-crew-supernova`.

`crew/supernova.test.ts` covers the kick: no crewmate moves before the front reaches it or after its swing settles, the front reaches every orbit, and a cut supernova lets go; on the phone, `PhoneSupernovaTests` replays the desktop's own readings and holds the same promises for its scene.


## Fixed stars

A crewmate whose task the Tasks panel lists under Pinned leaves its orbit and hangs as a fixed star in the sky (captain's INF-3634 plan, chosen on a playable preview: the constellation, the glint, every listed crewmate, and the filled pin in its summary).
`crewSignal.ts`'s `pinnedCrewOf` reads the list from the board the way the Tasks panel does: pins oldest first, each pinned task's open parts under it by priority, and only tasks with a crewmate in orbit.
A program's running part stays on its ring and is not a star.
`CrewOrbit.setPinned(ids)` takes that order, and `ComputerOrbits` hands it to every local orbit.
The places come from `fixedStars.ts`'s `skyPlaces`: a loose zigzag grown both ways from the upper-left diagonal, each star at its own share of the room between the widest reach of either occupied orbit plus 50 px and 240 px from the center on each axis.
Neighbours in a corner sit 11 to 12 degrees apart and alternate nearer and farther out on both sides of the diagonal; where the arc cannot grow both ways, it slides along the corner to stay in its room.
A corner whose room runs out hands on to the lower right, then the upper right, then the lower left; past what every corner holds, the two roomiest tighten.
A hairline in the stars' own light joins neighbours in pin order within one corner, never across two.
A star keeps its membership of its orbit, so the orbit's radius does not change, but it takes no seat: the seated crew re-space as if it had left, and make room again when it is unpinned.
An arriving crewmate unfolds on its slot first and then rises to its star; a pinned crewmate eases there and back over about half a second, and a leaving one fades where it hangs.
The glint is a soft glow one glyph out and four thin tapered rays behind the solid, the long pair 1.4 glyphs, in the crewmate's own light lifted a quarter toward white.
It twinkles slowly from its own seed, and status keeps the solid's color and spin.
A star sits a little in front of the orbit's middle, does not race in the rush, rides no warp and trails no streak.
It neither circles nor is circled: a wait or review satellite of a star is drawn as an arrow, as on a constellation.
A remote computer's cluster hangs its own stars inside its projection.
The summary of a pinned task wears the filled pin beside its key, named Pinned.
Reduced motion draws one settled frame: every star at its place, the glint steady.
The near crew canvas publishes the settled stars as `data-crew-stars`, and `data-plane-crew` leaves them out.

`fixedStars.test.ts` covers the staged settings and their later revision, the places at every crew size, the room between neighbours, the joins, the seat re-spacing, the easing, the rush and the unpin, and who is listed; `tests/e2e/crew-fixed-stars.spec.ts` pins a task by keys and reads its star off the stage; the phone reads the same places and look from the generated scene data.

## Batch gate

A pending batch status on the offered version adds `workPosture.batch` to the checks posture, preserving older views' checks fallback.
The stage replaces the dashed ring with two accent arcs at 0.8 of the glyph, each 110 degrees, 1.2 px wide and 0.6 alpha.
Waiting and paused batches hold still; only an active batch turns the gate at 0.5 rad/s, and reduced motion holds it still.
The crewmate stays banked at idle strength and pace with no tick or halo, in its existing seat.
The Tasks row shows a dot between the paired arcs and the dim word `batch`, keeps the Working group, and its shared status reads “Working · Waiting for the batch check”.
The phone reads the same optional posture and generated gate tuning for its native scene and Tasks marks.
