import InfinitaryKit
import SwiftUI

/// A presentation of existing board facts. No title, prose or age decides whether someone is working.
struct PhoneSceneRoster {
    /// Keeps prepared geometry outside display callbacks and remembers only programs actually seen running.
    @MainActor final class Cache {
        private struct Key: Equatable {
            let revision: Int, generation: Int
            let presence: [PhoneComputerPresence]
            let homeName: String
            let inReach: Bool
        }
        private var key: Key?
        private var value: PhoneSceneRoster?
        private var retained: [String: Set<String>] = [:]
        func read(board: PhoneBoard?, presence: [PhoneComputerPresence], homeName: String, inReach: Bool, generation: Int, revision: Int) -> PhoneSceneRoster {
            let next = Key(revision: revision, generation: generation, presence: presence, homeName: homeName, inReach: inReach)
            if key == next, let value { return value }
            if key?.generation != generation { retained = [:] }
            let roots = Set((board?.tasks ?? []).filter { $0.program == true && ($0.status == "active" || $0.status == "open") }.map(\.id))
            retained = retained.filter { roots.contains($0.key) }
            for task in board?.tasks ?? [] where task.kind == "work" && task.status == "active" && task.program != true && task.reviewOf == nil {
                if let parent = task.parentId, roots.contains(parent) { retained[parent, default: []].insert(PhoneSceneRoster.computerID(task)) }
            }
            // Seats are remembered from the last read of a real board, as the desktop remembers them; a new scene seats everyone afresh.
            let books = key?.generation == generation && (value?.sequence ?? -1) >= 0 ? value?.books : nil
            var roster = PhoneSceneRoster(board: board, presence: presence, homeName: homeName, inReach: inReach, generation: generation, retainedPrograms: retained, seats: books)
            if let previous = value, key?.generation == generation {
                // Keep the panned extent while work departs; a removal must not clip its flight or move the viewport.
                let left = max(roster.homeX, previous.homeX), right = max(roster.width - roster.homeX, previous.width - previous.homeX)
                for index in roster.computers.indices { roster.computers[index].x += left - roster.homeX }
                roster.homeX = left; roster.width = left + right; roster.height = max(roster.height, previous.height)
            }
            key = next; value = roster
            return roster
        }
    }
    struct Computer: Identifiable {
        let id: String
        let name: String
        let reachable: Bool
        let tasks: [PhoneTask]
        let programs: [Program]
        let ordinary: [PhoneTask]
        let programParts: Set<String>
        /// Its crew the Tasks list shows under Pinned, in that list's order, a program's parts on their rings left out:
        /// each hangs as a fixed star (INF-3634), giving up its seat but keeping its orbit.
        let pinned: [String]
        /// The constellation its stars hang in, in desktop scene pixels from its center, and how far it reaches on screen.
        let sky: PhoneFixedStars.Places
        let skyReach: Double
        /// Where each crewmate and program ring sits on this computer's orbits.
        let book: SeatBook
        /// The share of home's size this computer's group draws at, as on the desktop.
        let share: Double
        let radius: Double
        var x: Double = 0
        /// Its group's reach from its center: its orbits, and its stars when it has any, which hang past them.
        var extent: Double { max(radius, skyReach) }
        var width: Double { extent * 2 + 80 }
    }
    /// One tilted ring a program's running parts circle on, as the desktop's moonRings.
    struct MoonRing { let radius: Double; let tilt: Double; let node: Double; let count: Int }
    struct Program: Identifiable {
        let task: PhoneTask
        let parts: [PhoneTask]
        /// How much of the whole program has finished, 0 to 1: the gem's wires, as the desktop's programShare.
        let share: Double
        let rings: [MoonRing]
        var id: String { task.id }
        init(_ task: PhoneTask, parts: [PhoneTask], all: [PhoneTask]) {
            self.task = task; self.parts = parts
            let whole = all.filter { $0.parentId == task.id && $0.kind == "work" && $0.reviewOf == nil && ["active", "open", "done"].contains($0.status) }
            share = task.status == "done" ? 1 : whole.isEmpty ? 0 : Double(whole.filter { $0.status == "done" }.count) / Double(whole.count)
            rings = Self.moonRings(parts.count)
        }
        static func moonRings(_ count: Int) -> [MoonRing] {
            guard count > 0 else { return [] }
            let t = CharacterCatalog.shared.program
            let counts = Double(count) > t["secondRingPastParts"]! ? [(count + 1) / 2, count / 2] : [count]
            var rings: [MoonRing] = [], reach = 0.0
            for (j, n) in counts.enumerated() {
                let radius = max(t["ringPx"]!, Double(n) * t["partArcPx"]! / (2 * .pi), j > 0 ? reach + t["ringStepPx"]! : 0)
                reach = radius
                rings.append(MoonRing(radius: radius, tilt: max(0, t["tiltDeg"]! - Double(j) * t["secondTiltDropDeg"]!) * .pi / 180,
                                      node: j == 0 ? t["firstNodeRad"]! : t["secondNodeRad"]!, count: n))
            }
            return rings
        }
        /// A point on `ring` at angle `theta`, from the mark: x and y on the screen, z toward the viewer.
        static func point(_ ring: MoonRing, _ theta: Double) -> (x: Double, y: Double, z: Double) {
            let across = ring.radius * cos(theta), along = ring.radius * sin(theta), flat = along * cos(ring.tilt)
            return (across * cos(ring.node) - flat * sin(ring.node), across * sin(ring.node) + flat * cos(ring.node), along * sin(ring.tilt))
        }
        /// Where each running part circles `seconds` in, in the order filed, the first ring turning one way and the second the other.
        func places(at seconds: Double) -> [(id: String, x: Double, y: Double, z: Double)] {
            let turn = seconds * CharacterCatalog.shared.program["speedDegS"]! * .pi / 180
            var placed: [(id: String, x: Double, y: Double, z: Double)] = [], index = 0
            for (j, ring) in rings.enumerated() {
                for i in 0..<ring.count where index < parts.count {
                    let theta = 2 * .pi * Double(i) / Double(ring.count) + (j == 0 ? turn : 0.5 - turn)
                    let at = Self.point(ring, theta)
                    placed.append((parts[index].id, at.x, at.y, at.z)); index += 1
                }
            }
            return placed
        }
    }
    let tasks: [PhoneTask]
    let order: [String: Int]
    let links: [PhoneBoard.Link]
    let allTasks: [PhoneTask]
    var computers: [Computer]
    var width: Double
    var height: Double
    var homeX: Double
    let generation: Int
    let sequence: Int
    let inReach: Bool

    var books: [String: SeatBook] { Dictionary(uniqueKeysWithValues: computers.map { ($0.id, $0.book) }) }

    init(board: PhoneBoard?, presence: [PhoneComputerPresence], homeName: String, inReach: Bool, generation: Int, retainedPrograms: [String: Set<String>] = [:], seats previous: [String: SeatBook]? = nil) {
        self.generation = generation; sequence = board?.seq ?? -1; self.inReach = inReach
        let all = board?.tasks ?? []
        allTasks = all; links = board?.links ?? []
        tasks = all.filter { $0.kind == "work" && $0.status == "active" && $0.program != true }
            .sorted { $0.createdAt == $1.createdAt ? $0.key < $1.key : $0.createdAt < $1.createdAt }
        order = Dictionary(uniqueKeysWithValues: tasks.enumerated().map { ($0.element.id, $0.offset) })
        let programs = all.filter { $0.program == true && ($0.status == "active" || $0.status == "open") }
        let grouped = Dictionary(grouping: tasks, by: Self.computerID)
        // The fixed stars, as the desktop's pinnedCrewOf reads them: the Tasks list's own Pinned rows, in its order.
        let pinnedOrder = Self.pinnedOrder(board)
        let ids = ["home"] + Set(grouped.keys).union(retainedPrograms.values.flatMap { $0 }).filter { $0 != "home" }.sorted()
        computers = ids.map { id in
            let members = grouped[id] ?? [], observed = presence.first { $0.id == id }
            let roots = programs.filter { program in members.contains { $0.parentId == program.id && $0.reviewOf == nil } || retainedPrograms[program.id]?.contains(id) == true }
                .map { root in Program(root, parts: members.filter { $0.parentId == root.id && $0.reviewOf == nil }, all: all) }
            let ordinary = members.filter { task in task.reviewOf != nil || !roots.contains { $0.id == task.parentId } }
            // Every crewmate holds a seat, a program's parts included, and each program ring one on the first orbit.
            var book = previous.map { $0[id] ?? SeatBook() } ?? SeatBook(crew: members.map(\.id), marks: roots.map(\.id))
            if previous != nil { book.update(crew: members.map(\.id), marks: roots.map(\.id)) }
            let share = id == "home" ? 1 : CharacterCatalog.shared.ring["remoteShare"]!
            // A program keeps room for its rings; no unstarted, finished or remote placeholder dot is added.
            let programReach = roots.flatMap(\.rings).map(\.radius).max() ?? 0
            // The area follows the first orbit's current size.
            let radius = book.isEmpty ? 140 : Self.planeRadius(0, counts: book.counts) * share + programReach
            let parts = Set(roots.flatMap { $0.parts.map(\.id) }), ids = Set(members.map(\.id))
            let pinned = pinnedOrder.filter { ids.contains($0) && !parts.contains($0) }
            let sky = PhoneFixedStars.places(pinned.count, orbits: PhoneFixedStars.orbits(counts: book.counts))
            let skyReach: Double = sky.points.map { Double(max(abs($0.x), abs($0.y))) * Self.ringScale * share }.max() ?? 0
            return Computer(id: id, name: id == "home" ? homeName : observed?.name ?? all.first(where: { Self.computerID($0) == id })?.place?.name ?? PhoneMessages.phoneSceneComputerFallback(),
                            reachable: inReach && (id == "home" || observed?.inReach == true), tasks: members, programs: roots, ordinary: ordinary, programParts: parts,
                            pinned: pinned, sky: sky, skyReach: skyReach, book: book, share: share, radius: radius)
        }
        var left = -computers[0].width / 2, right = computers[0].width / 2
        for i in computers.indices where i > 0 {
            let half = computers[i].width / 2
            if i % 2 == 1 { computers[i].x = right + half; right += half * 2 }
            else { computers[i].x = left - half; left -= half * 2 }
        }
        width = right - left; homeX = -left
        for i in computers.indices { computers[i].x -= left }
        height = max(320, (computers.map(\.extent).max() ?? 140) * 2 + 64)
    }
    /// Every task the Tasks list shows under Pinned, in its order: each pinned task, oldest pin first, with its parts under it.
    static func pinnedOrder(_ board: PhoneBoard?) -> [String] {
        guard board?.tasks.contains(where: { $0.pinnedAt != nil }) == true else { return [] }
        return PhoneTaskList(board: board, cards: []).parts.first { $0.section == .pinned }?.rows.map(\.task.id) ?? []
    }
    /// The task crew browsing selected, by its touch identity: a crewmate's task id, or a program mark's computer and task.
    func task(selected id: String) -> PhoneTask? {
        if let task = allTasks.first(where: { $0.id == id }) { return task }
        for computer in computers {
            if let program = computer.programs.first(where: { computer.id + ":" + $0.task.id == id }) { return program.task }
        }
        return nil
    }
    static func computerID(_ task: PhoneTask) -> String {
        if let id = task.executionDeviceId { return id }
        // An older home's named remote place is not this computer and its reach is unknown.
        if let place = task.place { return "legacy:" + (place.name ?? place.where) }
        return "home"
    }
    /// The phone's orbits: the desktop's growing ring drawn at `ringScale`.
    static func planeRadius(_ plane: Int, counts: [Int]) -> Double { desktopRadius(plane, counts: counts) * ringScale }
    /// The narrowest portrait iPhone the app runs on: iPhone SE (2nd and 3rd generation) and 13 mini, 375 points.
    static let narrowestPortraitWidth = 375.0
    /// The captain's ask: "by default 8 crewmates should all be visible on a portrait screen on ios". The phone draws the
    /// desktop's ring at the share that keeps eight crewmates' first orbit, at its widest on screen, a glyph and a margin
    /// inside the narrowest portrait iPhone; the ring still grows and splits as on the desktop.
    static let ringScale: Double = {
        let catalog = CharacterCatalog.shared, plane = catalog.planes[0], incline = plane.inclination * .pi / 180
        // How far across the screen the tilted first orbit reaches, as a share of its radius.
        let across = (pow(cos(plane.node), 2) + pow(cos(incline) * sin(plane.node), 2)).squareRoot()
        let glyph = catalog.ring["glyphPx"]! * (0.84 + 0.32) / 2
        return (narrowestPortraitWidth / 2 - PhoneTheme.space3 - glyph) / (desktopRadius(0, counts: [8]) * across)
    }()
    /// The desktop's growing ring (orbitalPlanes.ts planeRadius): the innermost open orbit grows a notch with every
    /// crewmate up to its cap, and every orbit outside it holds at its cap.
    static func desktopRadius(_ plane: Int, counts: [Int]) -> Double {
        let p = CharacterCatalog.shared.planes[plane], start = CharacterCatalog.shared.ring["startRadiusPx"]!
        if plane < counts.lastIndex(where: { $0 > 0 }) ?? 0 { return p.radius }
        let n = plane < counts.count ? counts[plane] : 0
        if n <= 1 { return start }
        return min(p.radius, start + (p.radius - start) * Double(n - 1) / Double(p.capacity - 1))
    }
    /// A place on the orbits: a plane, fractional while gliding between two, an angle and a radius on screen.
    struct Orbit {
        var plane: Double
        var angle: Double
        var radius: Double
        /// How far the target's plane turned this frame, radians.
        var turn = 0.0
    }
    /// `flatten` opens the orbit toward face-on, as the tunnel warp does (CharacterWarp).
    static func projected(_ orbit: Orbit, flatten: Double = 0) -> (point: CGPoint, depth: Double) {
        let planes = CharacterCatalog.shared.planes
        let lower = max(0, min(planes.count - 1, Int(orbit.plane.rounded(.down)))), upper = min(planes.count - 1, lower + 1)
        let between = max(0, min(1, orbit.plane - Double(lower)))
        func on(_ p: CharacterCatalog.Plane) -> (x: Double, y: Double, depth: Double) {
            let incline = p.inclination * .pi / 180 * (1 - flatten)
            let u = orbit.radius * cos(orbit.angle), v = orbit.radius * sin(orbit.angle) * cos(incline)
            return (u * cos(p.node) - v * sin(p.node), u * sin(p.node) + v * cos(p.node), (sin(orbit.angle) * sin(incline) + 1) / 2)
        }
        let a = on(planes[lower]), b = between == 0 ? a : on(planes[upper])
        return (CGPoint(x: a.x + (b.x - a.x) * between, y: a.y + (b.y - a.y) * between), a.depth + (b.depth - a.depth) * between)
    }
    static func working(_ task: PhoneTask) -> Bool {
        if let posture = task.workPosture { return posture.state == "active" }
        return task.activity == "running" || task.activity == "starting"
    }
    /// Its working is a background wait, as on the desktop (INF-676, INF-1777): the checks watch, or local work it left running.
    static func wait(_ task: PhoneTask) -> String? {
        guard task.workPosture?.state == "active", let reason = task.workPosture?.reason, reason == "checks" || reason == "job" else { return nil }
        if reason == "checks", let batch = task.workPosture?.batch { return batch == "in-batch" ? "batch-running" : "batch" }
        return reason
    }
    /// Only an unreachable computer freezes its crew, as on the desktop; an unobserved posture still orbits as idle (INF-1520).
    static func unknown(_ task: PhoneTask, computer: Computer) -> Bool {
        !computer.reachable
    }
    static func words(_ task: PhoneTask, computer: Computer) -> String {
        if unknown(task, computer: computer) || task.workPosture?.state == "unknown" { return PhoneMessages.phoneSceneActivityUnknown() }
        if task.workPosture?.maintainers == true { return PhoneMessages.phoneWaitingMaintainers() }
        if task.workPosture?.reason == "checks" { return task.workPosture?.batch != nil ? PhoneMessages.phoneSceneWaitingBatchCheck() : PhoneMessages.phoneSceneWaitingChecks() }
        return working(task) ? PhoneMessages.phoneSceneWorking() : task.state
    }
}

/// Native frame-only state. Board changes are settled once, never stored in the shell's display clock.
/// The scene's render thread advances it while signals and keyboard reads arrive on the main thread, so every entry takes its lock.
final class PhoneSceneMotion: @unchecked Sendable {
    private let lock = NSLock()
    struct Glyph {
        var task: PhoneTask
        var point: CGPoint
        var center: CGPoint
        /// Its place on the orbits; a program part drawn on its ring has none.
        var orbit: PhoneSceneRoster.Orbit?
        var depth = 0.5, spin = 0.0, alpha = 1.0, unfold = 1.0, work = 0.0, flicker = 0.0, nudge = 0.0
        var unknown = false, programPart = false
        /// A background wait's eased blend (banked, inside the dashed wait ring) and the share of it that is local work (ember wires).
        var wait = 0.0, job = 0.0
        var batch = false, batchRunning = false
        /// Waiting on the captain (INF-1543): its eased blend and when the wait began, the breath's phase.
        var captain = 0.0, captainSince = 0.0
        /// A warp's change of size and its light trail (CharacterWarp.ride), on the drawn frame only.
        var scale = 1.0, streak: [CGPoint] = []
        /// A supernova's flash and kick lighting it toward white (CharacterSupernova.kick), on the drawn frame only.
        var flash = 0.0
        /// A fixed star's eased blend, 0 when it is not pinned, and its glint's twinkle, 0 on a settled frame (INF-3634).
        var star = 0.0, twinkle = 0.0
        /// Its glyph before the depth cue, as the desktop draws it: home's crowded planes, a smaller one in another
        /// computer's cluster, and smaller again once that cluster is crowded (orbit.ts, computers.ts).
        var px = CharacterCatalog.shared.ring["glyphPx"]!
        var size: Double { px * (0.84 + 0.32 * depth) * scale }
        static func px(computer: PhoneSceneRoster.Computer, programPart: Bool) -> Double {
            let ring = CharacterCatalog.shared.ring
            if computer.id != "home" { return Double(computer.tasks.count) > ring["crowdedCrew"]! ? ring["crowdedGlyphPx"]! : ring["remoteGlyphPx"]! }
            return programPart ? CharacterCatalog.shared.program["crewGapPx"]! : ring["glyphPx"]!
        }
    }
    struct Packet { let id: UUID; let taskID: String; let report: Bool; let started: Double }
    struct Mark: Identifiable {
        let task: PhoneTask; let computerID: String; let center: CGPoint; let point: CGPoint; let parts: [String]
        /// Its rings as drawn round the mark, each point marked near when it lies in front of the mark.
        let rings: [[(point: CGPoint, near: Bool)]]
        /// How much of the gem is wired, and its turn.
        let gem: Double; let spin: Double
        var id: String { computerID + ":" + task.id }
    }
    struct Frame {
        var glyphs: [Glyph]; let marks: [Mark]; let packets: [(CGPoint, Double)]; let links: [(CGPoint, CGPoint, Bool)]
        /// The hairline joining neighbouring fixed stars within one corner of the sky, by task id, drawn under the crew.
        var starJoins: [(from: String, to: String)] = []
    }
    private struct Member {
        var glyph: Glyph
        var arrived: Double
        let spawnDuration: Double
        var left: Double?
        var leaveFrom: CGPoint?
        var companion = CGPoint.zero
        var companionDepth = 0.0
        var companionBase: (blocker: String, origin: CGPoint, slot: CGPoint)?
        var dropped = false
        var flickerAt = -Double.infinity, boost = 0.0, failedAt = -Double.infinity
        /// A fixed star's blend and its place in the sky from its computer's center, easing there (INF-3634).
        var star = 0.0
        var starPlace: CGPoint?
        /// Where it was drawn last, star and circle included: a departure leaves from there.
        var drawn: CGPoint?
    }
    private var members: [String: Member] = [:]
    private var generation: Int?
    private var rosterReady = false
    private var time = 0.0
    private var last: Double?
    private var computerTime: [String: Double] = [:]
    private var packets: [Packet] = []
    /// Each program ring's place on its computer's first orbit, gliding as the crew's do.
    private var markOrbits: [String: (orbit: PhoneSceneRoster.Orbit, center: CGPoint)] = [:]
    private var home: CGPoint?
    private var drawingBooks: [String: PhoneSceneRoster.SeatBook] = [:]
    private var ride = CharacterWarp.Ride()
    /// The warp the crew ride this frame and how many ride it, for the backdrop under them.
    private var playing: CharacterWarp.Frame?
    private var riding = 0
    private var blast = CharacterSupernova.Ride()
    /// The supernova the home crew are kicked by this frame, for the blast under them.
    private var exploding: CharacterSupernova.Frame?
    var supernova: CharacterSupernova.Frame? { lock.withLock { exploding } }
    private var latest = Frame(glyphs: [], marks: [], packets: [], links: [])
    var warp: CharacterWarp.Frame? { lock.withLock { playing } }
    var riders: Int { lock.withLock { riding } }
    /// The last frame drawn, which touch, the keyboard and accessibility read between frames.
    var current: Frame { lock.withLock { latest } }
    /// The frames drawn over the last half second, each with the uptime it was drawn at, so a touch finds the frame
    /// that was on screen when the finger landed rather than the one drawn when its tap was recognized.
    private var drawn: [(at: Double, frame: Frame)] = []
    /// The frame drawn last at or before `uptime` (a `UITouch.timestamp`), or the oldest kept when it is older still.
    func frame(at uptime: Double) -> Frame {
        lock.withLock { drawn.last { $0.at <= uptime }?.frame ?? drawn.first?.frame ?? latest }
    }

    func receive(_ signal: PhoneSceneSignal) { lock.withLock { receiveLocked(signal) } }
    private func receiveLocked(_ signal: PhoneSceneSignal) {
        guard var member = members[signal.taskID], !member.glyph.unknown, member.left == nil else { return }
        switch signal.kind {
        case .report, .steer: packets.append(Packet(id: UUID(), taskID: signal.taskID, report: signal.kind == .report, started: time))
        case .failed: member.failedAt = time
        case .usage:
            member.boost = max(CharacterFlicker.intensity(signal.tokens), member.boost * CharacterFlicker.envelope(time - member.flickerAt))
            member.flickerAt = time
        }
        members[signal.taskID] = member
    }
    func discardEffects() { lock.withLock { discardLocked() } }
    private func discardLocked() {
        packets = []
        for id in Array(members.keys) {
            if members[id]?.left != nil { members.removeValue(forKey: id); continue }
            members[id]?.arrived = -.infinity
            members[id]?.glyph.alpha = 1; members[id]?.glyph.unfold = 1
            members[id]?.boost = 0; members[id]?.failedAt = -.infinity
        }
    }

    /// `warp` is the warp the first mate plays (CharacterWarp.frame) and `supernova` its supernova
    /// (CharacterSupernova.frame), each nil when none.
    func frame(roster: PhoneSceneRoster, now: Double, settled: Bool, warp playing: CharacterWarp.Frame? = nil,
               supernova bursting: CharacterSupernova.Frame? = nil) -> Frame {
        lock.withLock { frameLocked(roster: roster, now: now, settled: settled, warp: playing, supernova: bursting) }
    }
    private func frameLocked(roster: PhoneSceneRoster, now: Double, settled: Bool, warp playing: CharacterWarp.Frame?,
                             supernova bursting: CharacterSupernova.Frame?) -> Frame {
        let dt = min(0.05, max(0, now - (last ?? now))); last = now; time = now
        if settled { ride = CharacterWarp.Ride(); blast = CharacterSupernova.Ride() }
        let warp = settled ? nil : ride.resolve(playing, now: now)
        self.playing = warp
        let supernova = settled ? nil : blast.resolve(bursting, now: now)
        exploding = supernova
        if generation != roster.generation { rosterReady = false }
        let initial = generation != roster.generation || !rosterReady
        if initial { members = [:]; packets = []; computerTime = [:]; drawingBooks = [:]; generation = roster.generation; home = nil }
        let firstmate = CGPoint(x: roster.homeX, y: roster.height / 2)
        if let home {
            let shift = CGSize(width: firstmate.x - home.x, height: firstmate.y - home.y)
            if shift != .zero {
                for id in Array(members.keys) {
                    members[id]?.glyph.point.x += shift.width; members[id]?.glyph.point.y += shift.height
                    members[id]?.glyph.center.x += shift.width; members[id]?.glyph.center.y += shift.height
                    if let from = members[id]?.leaveFrom { members[id]?.leaveFrom = CGPoint(x: from.x + shift.width, y: from.y + shift.height) }
                }
            }
        }
        home = firstmate
        if roster.sequence >= 0 && roster.inReach { rosterReady = true }
        var target: [String: Glyph] = [:], marks: [Mark] = []
        let parts = Set(roster.computers.flatMap { $0.programParts })
        let cues = PhoneSceneCompanions.cues(roster.tasks, parts: parts)
        var circles: [String: (cue: PhoneSceneCompanions.Cue, share: Double, time: Double)] = [:]
        // Each computer hangs its own constellation over its own orbits (INF-3634): places from its center, and the joins.
        var starPlaces: [String: CGPoint] = [:], starJoins: [(from: String, to: String)] = []
        // Re-spacing and a resized orbit glide each crewmate around its orbit, never straight across it.
        let eased = initial || settled ? 1 : min(1, dt * 6)
        var markPlaces: [String: (orbit: PhoneSceneRoster.Orbit, center: CGPoint)] = [:]
        for computer in roster.computers {
            let turning = computer.reachable && !settled
            // A warp lends the home crew its lead, which stays where the warp leaves it; other computers keep their pace.
            let travel = computer.id == "home" ? warp.map { CharacterWarp.crewTravel($0.variant, $0.sp) } ?? 1 : 1
            if turning { computerTime[computer.id, default: 0] += dt * travel }
            let localTime = computerTime[computer.id, default: 0], center = CGPoint(x: computer.x, y: roster.height / 2)
            let counts = computer.book.counts
            func orbit(plane: Int, slot: Double) -> PhoneSceneRoster.Orbit {
                let rate = CharacterCatalog.shared.planes[plane].speedDegPerSec * .pi / 180
                return .init(plane: Double(plane), angle: slot - localTime * rate,
                             radius: PhoneSceneRoster.planeRadius(plane, counts: counts) * computer.share, turn: turning ? -dt * travel * rate : 0)
            }
            func place(_ orbit: PhoneSceneRoster.Orbit, around center: CGPoint) -> (CGPoint, Double) {
                let projected = PhoneSceneRoster.projected(orbit)
                return (CGPoint(x: center.x + projected.point.x, y: center.y + projected.point.y), projected.depth)
            }
            var book = drawingBooks[computer.id] ?? computer.book
            book.synchronize(computer.book)
            let ids = Set(computer.tasks.map(\.id)), stars = Set(computer.pinned)
            // A fixed star neither circles nor is circled: a wait on one, or by one, keeps its slot and its arrow.
            let eligible = cues.filter { id, cue in
                cue.circles && ids.contains(id) && ids.contains(cue.blocker) && !stars.contains(id) && !stars.contains(cue.blocker)
                    && (initial || settled || (members[id]?.glyph.unfold == 1 && members[cue.blocker]?.glyph.unfold == 1))
            }
            // A fixed star gives up its seat, so the crew left on its orbit close the gap; it keeps its orbit membership.
            var excluded = computer.programParts.union(eligible.keys).union(stars)
            // No bound holds a circle in: only a blocker without a seat leaves its group on the main orbit for
            // this frame. Each pass removes a group, so resolution always terminates.
            let startingSeats = book
            while true {
                book = startingSeats
                book.show(excluding: excluded)
                var rejected = Set<String>()
                for (blocker, group) in Dictionary(grouping: eligible.filter { excluded.contains($0.key) }, by: { $0.value.blocker }) {
                    if book.crew[blocker] == nil { rejected.formUnion(group.map(\.key)) }
                }
                if rejected.isEmpty { break }
                excluded.subtract(rejected)
            }
            drawingBooks[computer.id] = book
            let sky = computer.sky
            let scale = PhoneSceneRoster.ringScale * computer.share
            for (index, id) in computer.pinned.enumerated() {
                starPlaces[id] = CGPoint(x: sky.points[index].x * scale, y: sky.points[index].y * scale)
            }
            if CharacterCatalog.shared.fixedStars.joined {
                starJoins += sky.joins.map { (from: computer.pinned[$0.0], to: computer.pinned[$0.1]) }
            }
            for (id, cue) in eligible where excluded.contains(id) { circles[id] = (cue, computer.share, localTime) }
            var positions: [String: (CGPoint, Double, PhoneSceneRoster.Orbit?)] = [:]
            for (id, seat) in book.crew {
                let at = orbit(plane: seat.plane, slot: seat.slot), (point, depth) = place(at, around: center)
                positions[id] = (point, depth, at)
            }
            for program in computer.programs {
                guard let slot = book.marks[program.id] else { continue }
                let markID = computer.id + ":" + program.task.id
                var root = (orbit: orbit(plane: 0, slot: slot), center: center)
                if var had = markOrbits[markID], eased < 1 {
                    Self.glide(&had.orbit, toward: root.orbit, eased)
                    had.center = CGPoint(x: had.center.x + (center.x - had.center.x) * eased, y: had.center.y + (center.y - had.center.y) * eased)
                    root = had
                }
                markPlaces[markID] = root
                let (rootPoint, _) = place(root.orbit, around: root.center)
                // Each running part circles its program's mark on a tilted ring, nearer when it swings in front.
                for place in program.places(at: localTime) {
                    positions[place.id] = (CGPoint(x: rootPoint.x + place.x, y: rootPoint.y + place.y), 0.65 + place.z / 512, nil)
                }
                let steps = 48
                let rings = program.rings.map { ring in
                    (0...steps).map { i -> (point: CGPoint, near: Bool) in
                        let at = PhoneSceneRoster.Program.point(ring, 2 * .pi * Double(i) / Double(steps))
                        return (CGPoint(x: rootPoint.x + at.x, y: rootPoint.y + at.y), at.z > 0)
                    }
                }
                marks.append(Mark(task: program.task, computerID: computer.id, center: root.center, point: rootPoint,
                                  parts: program.parts.map(\.id), rings: rings, gem: program.share,
                                  spin: localTime * CharacterCatalog.shared.program["gemSpinRadS"]!))
            }
            for task in computer.tasks {
                guard let (point, depth, place) = positions[task.id] else { continue }
                let unknown = PhoneSceneRoster.unknown(task, computer: computer)
                // A background wait keeps it working at an idle pace, banked, as on the desktop.
                let wait = unknown ? nil : PhoneSceneRoster.wait(task), hot = !unknown && wait == nil && PhoneSceneRoster.working(task)
                target[task.id] = Glyph(task: task, point: point, center: center, orbit: place, depth: depth,
                    spin: localTime * (hot ? 1.6 : 0.35), work: hot ? 1 : 0,
                    unknown: unknown, programPart: computer.programParts.contains(task.id),
                    wait: wait == nil ? 0 : 1, job: wait == "job" ? 1 : 0,
                    batch: wait == "batch" || wait == "batch-running", batchRunning: wait == "batch-running",
                    captain: task.group == .waiting ? 1 : 0, captainSince: now,
                    px: Glyph.px(computer: computer, programPart: computer.programParts.contains(task.id)))
            }
        }
        markOrbits = markPlaces
        let orbit = CharacterCatalog.shared.orbit
        for (id, glyph) in target {
            if members[id] == nil { members[id] = Member(glyph: glyph, arrived: initial || settled || glyph.unknown ? -.infinity : now, spawnDuration: Self.duration(orbit["spawnMs"]!, glyph: glyph, home: firstmate)) }
            guard var member = members[id] else { continue }
            member.left = nil; member.leaveFrom = nil
            if !glyph.unknown {
                member.glyph.point.x -= member.companion.x; member.glyph.point.y -= member.companion.y
                member.glyph.depth -= member.companionDepth
            }
            var next = glyph
            if glyph.unknown && !initial {
                // Shift by the center's own move, so an unmoved computer leaves the frozen point exact.
                next.point = CGPoint(x: member.glyph.point.x + (glyph.center.x - member.glyph.center.x),
                                     y: member.glyph.point.y + (glyph.center.y - member.glyph.center.y))
                next.spin = member.glyph.spin
            } else if !initial && !settled { next.spin = member.glyph.spin + dt * (glyph.work > 0 ? 1.6 : 0.35) }
            next.work = member.glyph.work + (glyph.work - member.glyph.work) * eased
            next.wait = member.glyph.wait + (glyph.wait - member.glyph.wait) * eased
            // The wires' color only moves while it waits, so a wait ending keeps its hue as the ring fades.
            next.job = glyph.wait > 0 ? member.glyph.job + (glyph.job - member.glyph.job) * eased : member.glyph.job
            // The beacon eases in with the heat; its breath starts from the faintest light when the wait begins.
            next.captain = member.glyph.captain + (glyph.captain - member.glyph.captain) * eased
            next.captainSince = glyph.captain > 0 && member.glyph.captain < 0.001 ? now : member.glyph.captainSince
            let arrive = settled || glyph.unknown ? 1 : clamp01((now - member.arrived) / member.spawnDuration)
            next.unfold = glyph.unknown ? member.glyph.unfold : arrive >= 1 ? 1 : clamp01((arrive - 0.55) / 0.45)
            if arrive < 1 {
                let arc = Self.travel(from: firstmate, to: glyph.point, at: easeInOut(arrive))
                next.point = arc; next.alpha = min(1, arrive * 4)
            } else if !initial && !settled && !glyph.unknown {
                if var place = member.glyph.orbit, let goal = glyph.orbit {
                    Self.glide(&place, toward: goal, eased)
                    let center = CGPoint(x: member.glyph.center.x + (glyph.center.x - member.glyph.center.x) * eased,
                                         y: member.glyph.center.y + (glyph.center.y - member.glyph.center.y) * eased)
                    let projected = PhoneSceneRoster.projected(place)
                    next.orbit = place; next.center = center; next.depth = projected.depth
                    next.point = CGPoint(x: center.x + projected.point.x, y: center.y + projected.point.y)
                } else {
                    next.point = CGPoint(x: member.glyph.point.x + (glyph.point.x - member.glyph.point.x) * eased,
                                         y: member.glyph.point.y + (glyph.point.y - member.glyph.point.y) * eased)
                }
            } else if glyph.unknown && !initial {
                next.orbit = member.glyph.orbit
            }
            next.flicker = settled || glyph.unknown ? 0 : member.boost * CharacterFlicker.envelope(now - member.flickerAt)
            next.nudge = settled || glyph.unknown ? 0 : max(0, 1 - (now - member.failedAt) / 0.6)
            member.glyph = next; members[id] = member
        }
        for id in Array(members.keys) where target[id] == nil {
            guard var member = members[id] else { continue }
            if settled || initial { members.removeValue(forKey: id); continue }
            if member.left == nil { member.left = now; member.leaveFrom = member.drawn ?? member.glyph.point; member.dropped = roster.allTasks.first { $0.id == id }?.status == "dropped" }
            let duration = member.dropped ? orbit["awayMs"]! / 1000 : Self.duration(orbit["homeMs"]!, glyph: member.glyph, home: firstmate, from: member.leaveFrom)
            let progress = clamp01((now - member.left!) / duration)
            if progress >= 1 { members.removeValue(forKey: id); continue }
            member.glyph.alpha = 1 - progress; member.glyph.unfold = 1 - progress
            let from = member.leaveFrom ?? member.glyph.point
            let destination = member.dropped ? CGPoint(x: from.x, y: from.y - 30) : firstmate
            member.glyph.point = Self.travel(from: from, to: destination, at: easeInOut(progress))
            members[id] = member
        }
        // Keep base-orbit easing and companion easing independent. Unknown computers keep
        // their already-painted frame, and a returning crewmate glides back, never jumps.
        let bases = members.mapValues(\.glyph)
        for id in Array(members.keys) {
            guard var member = members[id], !member.glyph.unknown, member.left == nil else { continue }
            var offset = CGPoint.zero, depth = 0.0
            let slot = member.glyph.point
            var base: (blocker: String, origin: CGPoint, slot: CGPoint)?
            if let circle = circles[id], let builder = bases[circle.cue.blocker], let at = builder.orbit {
                let radius = PhoneSceneCompanions.radius(share: circle.share)
                let delta = PhoneSceneCompanions.offset(circle.cue, orbit: at, time: circle.time, settled: settled, radius: radius)
                base = (circle.cue.blocker, builder.point, slot)
                if let previous = member.companionBase, previous.blocker == circle.cue.blocker, eased < 1 {
                    member.companion.x += builder.point.x - previous.origin.x - (slot.x - previous.slot.x)
                    member.companion.y += builder.point.y - previous.origin.y - (slot.y - previous.slot.y)
                }
                offset = CGPoint(x: builder.point.x + delta.point.x - member.glyph.point.x,
                                 y: builder.point.y + delta.point.y - member.glyph.point.y)
                depth = builder.depth + delta.z / (512 * PhoneSceneRoster.ringScale * circle.share) - member.glyph.depth
            }
            member.companionBase = base
            member.companion.x += (offset.x - member.companion.x) * eased
            member.companion.y += (offset.y - member.companion.y) * eased
            member.companionDepth += (depth - member.companionDepth) * eased
            member.glyph.point.x += member.companion.x; member.glyph.point.y += member.companion.y
            member.glyph.depth += member.companionDepth
            members[id] = member
        }
        if settled { discardLocked() }
        // A new scene hangs its stars at once, as it seats its crew; a settled frame holds them steady.
        let shown = applyStars(starPlaces, now: now, snap: settled || initial, settled: settled, dt: dt)
        for id in Array(members.keys) { members[id]?.drawn = shown[id]?.point }
        var glyphs = members.values.map { shown[$0.glyph.task.id] ?? $0.glyph }
        riding = 0
        if let warp { riding = Self.ride(&glyphs, warp: warp, roster: roster, home: firstmate, offsets: members.mapValues(\.companion)) }
        if let supernova {
            for i in glyphs.indices where Self.rides(glyphs[i]) {
                CharacterSupernova.kick(&glyphs[i], around: firstmate, f: supernova, scale: PhoneSceneRoster.ringScale)
            }
        }
        glyphs.sort { $0.depth < $1.depth }
        let byID = Dictionary(uniqueKeysWithValues: glyphs.map { ($0.task.id, $0) })
        let byKey = Dictionary(uniqueKeysWithValues: glyphs.map { ($0.task.key, $0) })
        var links: [(CGPoint, CGPoint, Bool)] = []
        for glyph in glyphs {
            if let review = glyph.task.reviewOf, let builder = byID[review] { links.append((glyph.point, builder.point, true)) }
            for key in glyph.task.blockedBy {
                if let blocker = byKey[key], blocker.task.reviewOf != glyph.task.id, glyph.task.reviewOf != blocker.task.id {
                    links.append((glyph.point, blocker.point, false))
                }
            }
        }
        packets.removeAll { packet in
            guard let glyph = byID[packet.taskID] else { return true }
            return now - packet.started >= Self.duration(orbit["packetMs"]!, glyph: glyph, home: firstmate)
        }
        let flying = packets.compactMap { packet -> (CGPoint, Double)? in
            guard let glyph = byID[packet.taskID], !glyph.unknown else { return nil }
            let progress = clamp01((now - packet.started) / Self.duration(orbit["packetMs"]!, glyph: glyph, home: firstmate))
            // A part's report goes to its program's ring, which carries the program's word home.
            let home = marks.first { $0.computerID == PhoneSceneRoster.computerID(glyph.task) && $0.parts.contains(packet.taskID) }?.point ?? firstmate
            return (Self.travel(from: packet.report ? glyph.point : home, to: packet.report ? home : glyph.point, at: easeInOut(progress)), sin(progress * .pi))
        }
        let lit = Set(glyphs.filter { $0.star > 0.01 }.map(\.task.id))
        latest = Frame(glyphs: glyphs, marks: marks, packets: flying, links: links,
                       starJoins: starJoins.filter { lit.contains($0.from) && lit.contains($0.to) })
        let drawnAt = ProcessInfo.processInfo.systemUptime
        drawn.append((drawnAt, latest))
        if let stale = drawn.firstIndex(where: { drawnAt - $0.at <= 0.5 }), stale > 0 { drawn.removeFirst(stale) }
        return latest
    }
    /// The warp's riders, on the drawn frame only: every home crewmate on its orbit, opened face-on and drawn in as
    /// the tunnel and sphere do, then moved by CharacterWarp.ride. Returns how many ride.
    private static func ride(_ glyphs: inout [Glyph], warp: CharacterWarp.Frame, roster: PhoneSceneRoster, home: CGPoint, offsets: [String: CGPoint]) -> Int {
        let flat = warp.variant == .tunnel ? warp.k : 0
        let shrink = 1 - (warp.variant == .tunnel ? 0.12 : warp.variant == .sphere ? 0.05 : 0) * warp.k
        let riders = glyphs.indices.filter { rides(glyphs[$0]) }.sorted { (roster.order[glyphs[$0].task.id] ?? .max, glyphs[$0].task.id) < (roster.order[glyphs[$1].task.id] ?? .max, glyphs[$1].task.id) }
        for (index, i) in riders.enumerated() {
            if var orbit = glyphs[i].orbit, offsets[glyphs[i].task.id] ?? .zero == .zero {
                orbit.radius *= shrink
                let projected = PhoneSceneRoster.projected(orbit, flatten: flat)
                glyphs[i].point = CGPoint(x: glyphs[i].center.x + projected.point.x, y: glyphs[i].center.y + projected.point.y)
                glyphs[i].depth = projected.depth
            }
            CharacterWarp.ride(&glyphs[i], index: index, count: riders.count, around: home, w: warp, scale: PhoneSceneRoster.ringScale)
        }
        return riders.count
    }
    /// A home crewmate on its orbit, which a warp or a supernova takes along; a fixed star holds its place.
    private static func rides(_ g: Glyph) -> Bool {
        !g.unknown && !g.programPart && g.star < 0.5 && g.unfold >= 1 && g.alpha >= 1 && g.orbit != nil && PhoneSceneRoster.computerID(g.task) == "home"
    }
    /// Ease each pinned crewmate to its place in the sky and back (INF-3634), as the desktop's applyStars: it rises once
    /// it has arrived, a little nearer than the orbit's middle; one leaving keeps its glint fading where it hangs. Returns
    /// every drawn glyph the stars move, keyed by task id; the members keep their orbit places, so a star returning to a
    /// seat glides back from the orbit it never left.
    private func applyStars(_ places: [String: CGPoint], now: Double, snap: Bool, settled: Bool, dt: Double) -> [String: Glyph] {
        let tuning = CharacterCatalog.shared.fixedStars
        let blend = snap ? 1 : min(dt * tuning.blendRate, 1), glide = snap ? 1 : min(dt * tuning.placeRate, 1)
        var drawn: [String: Glyph] = [:]
        for id in Array(members.keys) {
            guard var member = members[id] else { continue }
            let place = places[id]
            if member.left == nil && !member.glyph.unknown {
                let target = place != nil && member.glyph.unfold >= 1 ? 1.0 : 0.0
                member.star += (target - member.star) * blend
                if target == 0 && member.star < 0.001 { member.star = 0 }
                if let place {
                    if member.star < 0.02 || member.starPlace == nil { member.starPlace = place }
                    else if let at = member.starPlace {
                        member.starPlace = CGPoint(x: at.x + (place.x - at.x) * glide, y: at.y + (place.y - at.y) * glide)
                    }
                }
                members[id] = member
            }
            guard member.star > 0, let at = member.starPlace else { continue }
            let k = member.star * member.star * (3 - 2 * member.star)
            var glyph = member.glyph
            if member.left == nil {
                let point = CGPoint(x: glyph.center.x + at.x, y: glyph.center.y + at.y)
                glyph.point = CGPoint(x: glyph.point.x + (point.x - glyph.point.x) * k, y: glyph.point.y + (point.y - glyph.point.y) * k)
                glyph.depth += (tuning.depth - glyph.depth) * k
            }
            glyph.star = k
            glyph.twinkle = PhoneFixedStars.twinkle(seed: PhoneFixedStars.seed(id), now: now, settled: settled)
            drawn[id] = glyph
        }
        return drawn
    }
    /// Ride the plane's turn, then close on the target by the nearest way round, its radius and plane with it.
    private static func glide(_ place: inout PhoneSceneRoster.Orbit, toward goal: PhoneSceneRoster.Orbit, _ eased: Double) {
        place.angle += goal.turn
        var gap = goal.angle - place.angle
        gap -= (gap / (2 * .pi)).rounded() * 2 * .pi
        place.angle += gap * eased
        place.radius += (goal.radius - place.radius) * eased
        place.plane += (goal.plane - place.plane) * eased
        place.turn = goal.turn
    }
    private static func duration(_ base: Double, glyph: Glyph, home: CGPoint, from: CGPoint? = nil) -> Double {
        guard PhoneSceneRoster.computerID(glyph.task) != "home" else { return base / 1000 }
        let trip = CharacterCatalog.shared.remoteTrip, at = from ?? glyph.point
        let distance = hypot(at.x - home.x, at.y - home.y)
        let extra = (trip["acrossMs"]! - CharacterCatalog.shared.orbit["spawnMs"]!) * (distance - trip["homeDistancePx"]!) / (trip["acrossPx"]! - trip["homeDistancePx"]!)
        return (base + max(0, extra)) / 1000
    }
    static func travel(from a: CGPoint, to b: CGPoint, at t: Double) -> CGPoint {
        let dx = b.x - a.x, dy = b.y - a.y, q = 1 - t
        let first = CGPoint(x: a.x + (dx * cos(0.8) - dy * sin(0.8)) * 0.38, y: a.y + (dy * cos(0.8) + dx * sin(0.8)) * 0.38)
        let second = CGPoint(x: b.x - dx * 0.22 - dy * 0.1, y: b.y - dy * 0.22 + dx * 0.1)
        return CGPoint(x: q * q * q * a.x + 3 * q * q * t * first.x + 3 * q * t * t * second.x + t * t * t * b.x,
                       y: q * q * q * a.y + 3 * q * q * t * first.y + 3 * q * t * t * second.y + t * t * t * b.y)
    }
}

private extension Array where Element == Int { func max(default value: Int) -> Int { self.max() ?? value } }
