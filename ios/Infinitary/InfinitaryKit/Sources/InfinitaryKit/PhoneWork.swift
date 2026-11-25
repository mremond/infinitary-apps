import Foundation

public struct PhoneLastTurn: Decodable, Sendable {
    public let you: String
    public let reply: Reply?
    /// INF-1771: the round before the newest, absent from an older Mac and null before a second message.
    public let previous: PhoneLastRound?
    /// The message's id, which a take back names (docs/task-capture.md, "Taking back a message"); absent from an older
    /// computer.
    public internal(set) var askId: String? = nil
    /// When the computer accepted the message, in ms since the epoch: the take-back minute runs from it.
    public internal(set) var sentAt: Double? = nil
    /// The captain took the message back.
    public internal(set) var takenBack: Bool? = nil
    public struct Reply: Decodable, Sendable {
        public let text: String
        public let problem: Bool?
        /// INF-1517: `completed` lets the line fade after its reading time; anything else stays (docs/composer.md).
        public let eligibility: String?
        /// The closing words as written, line breaks kept, when they differ from `text`.
        public let words: String?
        /// The captain took the message back before any turn read it: the phone words the line itself
        /// (`shellLastTurnRevertedUnread`); `text` keeps the same words in English for a reader that words nothing.
        public var withdrawn: Bool? = nil
        /// The line as the phone shows it: its own words for a message withdrawn unread.
        public var shown: String { withdrawn == true ? PhoneMessages.shellLastTurnRevertedUnread() : text }
    }

    /// This newest round as the older one, once a newer message is sent.
    public var round: PhoneLastRound {
        PhoneLastRound(you: you, reply: reply, askId: askId, sentAt: sentAt, takenBack: takenBack)
    }
}

/// One round of the last turn: a message of the captain's and the reply line kept beside it.
public struct PhoneLastRound: Decodable, Sendable {
    public let you: String
    public let reply: PhoneLastTurn.Reply?
    public internal(set) var askId: String? = nil
    public internal(set) var sentAt: Double? = nil
    public internal(set) var takenBack: Bool? = nil
    public init(you: String, reply: PhoneLastTurn.Reply?, askId: String? = nil, sentAt: Double? = nil, takenBack: Bool? = nil) {
        self.you = you; self.reply = reply; self.askId = askId; self.sentAt = sentAt; self.takenBack = takenBack
    }
}

public struct PhoneMove: Decodable, Sendable {
    public let ok: Bool
    public let text: String?
}

/// The Mac owns state, allowed moves and timeline wording. Unknown fields stay with the Mac.
public struct PhoneTask: Decodable, Identifiable, Sendable {
    public let id: String
    public let key: String
    public let projectId: String
    public let parentId: String?
    public let kind: String
    public let title: String
    public internal(set) var status: String
    public let createdAt: Double
    /// When the Mac last wrote the task, a note on its record included: the take and the return of its browser each
    /// note it, so the row moves with them (`PhoneRecord.browserLineRead`). Absent from an older Mac's rows.
    public let updatedAt: Double?
    public let startPolicy: String?
    /// The home’s dated start-wait line, shared with its first mate and desktop views.
    /// Absent while a start attempt stands, as the host leaves it out then (`taskProtocol.ts`); the start intent's fold
    /// clears it the same way.
    public internal(set) var queueWait: QueueWait?
    public struct QueueWait: Decodable, Sendable { public let line: String; public let since: Double? }
    public internal(set) var startAttempt: StartAttempt?
    public let requiredAction: RequiredAction?
    public internal(set) var activity: String?
    public let tier: String?
    public let executionDeviceId: String?
    public let reviewOf: String?
    public let program: Bool?
    public let workPosture: WorkPosture?
    public struct WorkPosture: Decodable, Sendable {
        public let state: String
        public let reason: String
        public let batch: String?
        public let maintainers: Bool?
        /// A crewmate failing at its provider: `retrying` or `stuck` (the Mac's `AT_PROVIDER_WORDS`).
        public let atProvider: String?
        /// The account's typed cut-off while `access` stands on it; the record reads only its class.
        public let hold: Hold?
        public struct Hold: Decodable, Sendable { public let `class`: String? }
    }
    public let goal: String?
    public let startedAt: Double?
    public internal(set) var moves: [String: PhoneMove]?
    public let outcomeSummary: String?
    public let waitingCardId: String?
    public let answerNoteId: String?
    public let answerSince: Double?
    public let assignee: String?
    public let modelLabel: String?
    public let brief: String?
    public let outcome: String?
    public let problem: String?
    public let events: [Event]?
    public let intent: Intent?
    public let plan: Plan?
    public let place: Place?
    public let blockedBy: [String]
    /// INF-1926: the rest of what the desktop's crew summary reads (src/shared/taskFacts.ts), each optional so an older
    /// Mac's rows still decode: the board row's lifecycle facts, then the record's own reading (`.detail`).
    public internal(set) var closedReason: String?
    public let flags: Flags?
    public struct Flags: Decodable, Sendable { public let blocked: Bool; public let held: Bool; public let needsYou: Bool? }
    public let children: Children?
    public struct Children: Decodable, Sendable { public let total: Int; public let closed: Int }
    /// The most pressing status among its open parts, on a backlog parent that runs no program and nothing blocks
    /// (`taskViewSchema.partsStatus`): its status word follows them. Absent on every other task and from an older Mac.
    public let partsStatus: String?
    public let startNotice: StartNotice?
    public struct StartNotice: Decodable, Sendable { public let reason: String }
    public let waitingCardMerges: Bool?
    public let blockedSince: [String: Double]?
    public let model: String?
    public let delivery: Delivery?
    public let activityLog: [ActivityRow]?
    public let said: ActionLine?
    public let reasoning: Reasoning?
    /// INF-1517: a card of this task put aside on the Mac, set only by `PhoneBoard.presenting`, as the Mac's own
    /// `presentTask` (src/shared/taskWaiting.ts) sets it for presentation alone.
    public internal(set) var minimizedCardId: String?
    /// INF-2928 piece 1: what the Mac's Tasks rows read beyond the facts above (src/panels/now/rows.ts), each optional so
    /// an older Mac's rows still decode: the order (`priority`, 0 urgent to 3 low, then `createdAt`; Done by `closedAt`),
    /// the crew filing's origin and whether it is new, and started work sent back to the backlog.
    public let priority: Double?
    public let closedAt: Double?
    public let foundOn: String?
    public let filingNew: Bool?
    public let backlogSince: Double?
    /// INF-3127: when the captain pinned the task to the top of Tasks; nil while it is not pinned, and from an older Mac.
    public let pinnedAt: Double?
    /// The tags it carries, alphabetical (`taskTagViewSchema`, docs/task-tags.md); absent while it carries none, and
    /// from an older Mac. The phone shows them and filters by them, and never changes them.
    public let tags: [Tag]?
    public struct Tag: Decodable, Sendable { public let id: String; public let name: String }
    /// INF-2935, piece 2: what the Mac's task record reads beyond the facts above (src/shared/tasks.ts
    /// `taskDetailSchema`), each optional so an older Mac's record still decodes. The board row carries the first four.
    public let blocks: [String]?
    public let replacedBy: String?
    public let captainWait: Bool?
    public let waits: [Wait]?
    public let repo: Repo?
    public let cards: [CardRow]?
    public let runsOn: RunsOn?
    public let policies: Policies?
    public let rigor: String?
    public let dropEffects: DropEffects?
    public let closing: Closing?
    public let hold: Hold?
    public let filing: Filing?
    public let asks: [Ask]?
    public let skippedPlanBecause: String?
    public let browser: Browser?
    public let deliverable: String?
    /// Its parts, each as its Tasks row reads it, in the order they were filed (`taskDetailSchema.parts`); absent on a
    /// task with none, and from an older Mac. The record's attention sentence reads what its open parts are doing.
    public let parts: [PhoneTask]?
    /// A standing wait's owner fact (`taskWaitSchema`, src/shared/taskWaits.ts).
    public struct Wait: Decodable, Sendable {
        public let id: String
        public let kind: String
        public let label: String
        public let since: Double?
        public let next: Next?
        public struct Next: Decodable, Sendable { public let kind: String; public let at: Double }
    }
    public struct Repo: Decodable, Sendable { public let name: String; public let branch: String? }
    /// One card the task showed, newest first: open on the stage or put aside, or closed with how it ended.
    public struct CardRow: Decodable, Identifiable, Sendable {
        public let id: String
        public let kind: String
        public let title: String
        public let state: String
        public let minimized: Bool?
        public let ending: String?
        public let at: Double
    }
    public struct RunsOn: Decodable, Sendable { public let label: String; public let source: String; public let reason: String? }
    public struct Policies: Decodable, Sendable {
        public let delivery: Choice<String>
        public let autonomy: Choice<Bool>
        public let rigor: Care
        public struct Choice<Value: Decodable & Sendable>: Decodable, Sendable { public let value: Value; public let source: String }
        public struct Care: Decodable, Sendable { public let value: String; public let source: String; public let requested: String? }
    }
    /// What Drop task would affect; present only while Drop task applies.
    public struct DropEffects: Decodable, Sendable {
        public let parts: [Part]
        public let waiting: [Named]
        public let underway: [Named]
        public struct Part: Decodable, Sendable { public let key: String; public let title: String; public let started: Bool? }
        public struct Named: Decodable, Sendable { public let key: String; public let title: String }
    }
    public struct Closing: Decodable, Sendable { public let at: Double; public let note: String? }
    public struct Hold: Decodable, Sendable { public let title: String; public let text: String }
    public struct Filing: Decodable, Sendable { public let why: String; public let originKey: String; public let verdict: String? }
    public struct Ask: Decodable, Identifiable, Sendable { public let id: String; public let at: Double; public let text: String }
    /// The task's own browser on its Mac; the record reads only whether the captain holds it.
    public struct Browser: Decodable, Sendable { public let state: String; public let control: String? }
    public var canSteer: Bool { status == "active" && startedAt != nil }
    /// The Mac's `nowGroupOf` (src/shared/nowPanel.ts) through its generated table. A note's answer, like a card put
    /// aside, lists under Waiting on you whatever the task's state, as the table's minimized input does.
    public var group: PhoneTaskGroup? {
        .reading(status: status, work: kind == "work", required: requiredAction != nil,
                 waiting: waitingCardId != nil,
                 starting: startAttempt?.phase == "preparing" || startAttempt?.phase == "checking" || (status == "active" && activity == "starting"),
                 onRequest: startPolicy == "on-request", minimized: minimizedCardId != nil || answerNoteId != nil,
                 backlog: backlogSince != nil)
    }
    public struct StartAttempt: Decodable, Sendable {
        public let phase: String
        /// When the attempt was accepted, for the record's slow-start line; absent from an older Mac.
        public let since: Double?
    }
    public struct RequiredAction: Decodable, Sendable { public let state: String?; public let result: String? }
    public var state: String {
        if status == "done" { return PhoneMessages.phoneWorkStateDone() }
        if status == "dropped" { return PhoneMessages.phoneWorkStateDropped() }
        if waitingCardId != nil || answerNoteId != nil { return PhoneMessages.phoneWorkStateWaitingOnYou() }
        if startAttempt?.phase == "preparing" || startAttempt?.phase == "checking" { return PhoneMessages.phoneWorkStateStarting() }
        if !blockedBy.isEmpty { return PhoneMessages.phoneWorkStateWaitingOnTask() }
        if status == "open" { return startPolicy == "on-request" ? PhoneMessages.phoneWorkStateBacklog() : PhoneMessages.phoneWorkStateQueued() }
        switch activity {
        case "running": return PhoneMessages.phoneWorkStateWorking()
        case "starting": return PhoneMessages.phoneWorkStateStarting()
        case "interrupted": return PhoneMessages.phoneWorkStateInterrupted()
        // INF-2553: an interrupt the phone sent and its computer has not shown yet.
        case "stopping": return PhoneMessages.phoneWorkStateStopping()
        case "idle": return PhoneMessages.phoneWorkStateIdle()
        default: return PhoneMessages.phoneWorkStateNotStarted()
        }
    }
    public struct Place: Decodable, Sendable {
        public let `where`: String
        public let name: String?
        public let reach: String?
        public let noNewWork: Bool?
        /// Its computer is being updated (the Mac's `TaskPlace.updating`): it reads updating, never out of reach.
        public let updating: Bool?
    }
    public struct Intent: Decodable, Sendable { public let userWords: String }
    public struct Plan: Decodable, Sendable {
        public let items: [Item]
        public let at: Double?
        public struct Item: Decodable, Sendable {
            public let label: String
            public let state: String
            public let short: String?
            public let since: Double?
        }
    }
    /// The change where the project lives, its checks and a review's verdict (src/shared/tasks.ts `taskDeliveryViewSchema`).
    public struct Delivery: Decodable, Sendable {
        public let prUrl: String?
        public let prNumber: Int?
        public let changeLabel: String?
        public let headSha: String?
        public let ci: String?
        public let ciAt: Double?
        public let checks: CheckSnapshot?
        public let ciStartedAt: Double?
        public let ciFinishedAt: Double?
        public let runChecks: RunChecks?
        public let reviewVerdict: String?
        public let reviewRisk: String?
        /// How the work reaches its project (`direct-pr`, `queue-pr`, `local-only`, `in-place`).
        public let mode: String?
        public let landedMode: String?
        public struct CheckSnapshot: Decodable, Sendable {
            public let headSha: String
            public let items: [Item]
            public let complete: Bool?
            public let problem: String?
            public let absenceDeclared: Bool?
            /// `manual`: a check a person must start, such as a GitLab manual job; it holds (`checkItemSchema`).
            /// `failureAllowed`: a neutral check that failed where its project allows it; it holds nothing.
            public struct Item: Decodable, Sendable { public let name: String; public let state: String; public let manual: Bool?; public let failureAllowed: Bool? }
        }
        public struct RunChecks: Decodable, Sendable {
            public let state: String
            public let startedAt: Double?
            public let finishedAt: Double?
            public let at: Double
        }
    }
    /// One row of the record's Activity; `from` is set on a row another task wrote.
    public struct ActivityRow: Decodable, Sendable {
        public let id: Int?
        public let at: Double
        public let kind: String
        public let text: String
        public let from: From?
        public let actions: [ActionLine]?
        /// The minor events folded under the row, oldest first.
        public let folded: [Folded]?
        public struct Folded: Decodable, Sendable { public let at: Double; public let kind: String; public let text: String }
        public struct From: Decodable, Sendable { public let id: String; public let key: String }
    }
    public struct ActionLine: Decodable, Sendable { public let at: Double; public let text: String }
    public struct Reasoning: Decodable, Sendable { public let level: String; public let lower: String? }
    public struct Event: Decodable, Identifiable, Sendable {
        public let id: Int
        public let at: Double
        public let actor: String
        public let kind: String
        public let text: String
    }
}

/// What a task's row shows (`PhoneBoard.opening`).
public enum PhoneRowOpening: Equatable, Sendable {
    /// This card, on Home.
    case card(String)
    /// The card of a required step put off, which the Mac's `show-card` move puts up again.
    case showCard
    case record
}

public struct PhoneBoard: Decodable, Sendable {
    public let seq: Int
    public internal(set) var tasks: [PhoneTask]
    public let projects: [Project]
    public let links: [Link]?
    /// INF-3764: present when the board was read without its closed rows (`board-without-closed`): the ids of the
    /// rows left out that Tasks lists under Done, by project, so Done counts them before they are read.
    public internal(set) var closedLeftOut: ClosedLeftOut? = nil
    public struct ClosedLeftOut: Decodable, Sendable { public let done: [String: [String]] }
    public struct Link: Decodable, Sendable { public let fromId: String; public let toId: String; public let type: String }

    public var leftOutDone: Int { closedLeftOut?.done.values.reduce(0) { $0 + $1.count } ?? 0 }

    /// The Mac's `applyTaskBoardDelta` keeps a board read without its closed rows so, less each row the delta brings
    /// back or takes off the whole board.
    func leaving(_ gone: Set<String>) -> ClosedLeftOut? {
        guard let left = closedLeftOut else { return nil }
        return ClosedLeftOut(done: left.done.compactMapValues { ids in
            let kept = ids.filter { !gone.contains($0) }
            return kept.isEmpty ? nil : kept
        })
    }
    public struct Project: Decodable, Sendable {
        public let id: String
        public let name: String
        /// Whether a repository backs the project, and whether it is archived: a row leaves out the project's name where
        /// only one such project could be meant (the Mac's `hasSingleRegisteredRepoProject`).
        public let repo: Repo?
        /// Every repository the project holds, first first; absent from an older Mac, read as `repo` alone.
        public let repos: [Repo]?
        public let archived: Bool?
        /// The project's own tags, alphabetical (`projectTagViewSchema`); absent while it has none, and from an older Mac.
        public let tags: [PhoneTask.Tag]?
        public struct Repo: Decodable, Sendable { public let name: String }

        /// A task's Project fact (the Mac's `projectFact`): the project's name, and the repository the task works
        /// in beside it when the project holds more than one.
        public func fact(repository: String?) -> String {
            guard let repository, (repos?.count ?? 0) > 1 else { return name }
            return PhoneMessages.cardRecordProjectRepository(project: name, repository: repository)
        }
    }

    /// The Mac's `applyTaskBoardDelta` (src/shared/tasks.ts): this board when the delta is older, the next board when
    /// the delta's base is this board's seq, and nil on a gap, which resyncs from a full read (INF-1854: re-reading
    /// a large board on every change stalled the scene).
    public func applying(_ delta: PhoneBoardDelta) -> PhoneBoard? {
        if delta.seq <= seq { return self }
        guard delta.baseSeq == seq else { return nil }
        let removed = Set(delta.removed), upserted = Set(delta.upserts.map(\.id))
        let rows = tasks.filter { !removed.contains($0.id) && !upserted.contains($0.id) } + delta.upserts
        func key(_ link: Link) -> String { "\(link.fromId) \(link.toId) \(link.type)" }
        let unlinked = Set(delta.links.removed.map(key)), linked = Set(delta.links.added.map(key))
        let edges = (links ?? []).filter { !unlinked.contains(key($0)) && !linked.contains(key($0)) } + delta.links.added
        return PhoneBoard(seq: delta.seq,
                          tasks: rows.sorted { $0.createdAt == $1.createdAt ? $0.id < $1.id : $0.createdAt < $1.createdAt },
                          projects: delta.projects, links: edges.sorted { key($0) < key($1) },
                          closedLeftOut: leaving(removed.union(upserted)))
    }

    /// INF-2773: a run of deltas read in one catch-up, folded with one sort at the end. It gives the board that
    /// applying them one at a time gives, keyed by id and link as the Mac's `applyTaskBoardDelta` is: an older delta
    /// is passed over, and a gap anywhere is nil, which resyncs from a full read.
    public func applying(run deltas: [PhoneBoardDelta]) -> PhoneBoard? {
        guard deltas.contains(where: { $0.seq > seq }) else { return self }
        func key(_ link: Link) -> String { "\(link.fromId) \(link.toId) \(link.type)" }
        var rows = Dictionary(tasks.map { ($0.id, $0) }, uniquingKeysWith: { _, later in later })
        var edges = Dictionary((links ?? []).map { (key($0), $0) }, uniquingKeysWith: { _, later in later })
        var at = seq, projects = self.projects
        var gone = Set<String>()
        for delta in deltas where delta.seq > at {
            guard delta.baseSeq == at else { return nil }
            for id in delta.removed { rows[id] = nil; gone.insert(id) }
            for task in delta.upserts { rows[task.id] = task; gone.insert(task.id) }
            for link in delta.links.removed { edges[key(link)] = nil }
            for link in delta.links.added { edges[key(link)] = link }
            at = delta.seq; projects = delta.projects
        }
        return PhoneBoard(seq: at,
                          tasks: rows.values.sorted { $0.createdAt == $1.createdAt ? $0.id < $1.id : $0.createdAt < $1.createdAt },
                          projects: projects, links: edges.values.sorted { key($0) < key($1) },
                          closedLeftOut: leaving(gone))
    }

    /// INF-1517: the Mac's `presentTask` rule (src/shared/taskWaiting.ts, docs/task-record.md "Minimized cards in
    /// Tasks") for a card put aside: its task lists under Waiting on you, unless the task is active and its author still
    /// works or owes the card an answer. Presentation only; the card stays minimized until a row brings it back.
    public func presenting(_ cards: [PhoneCard]) -> PhoneBoard {
        var board = self
        board.tasks = tasks.map { task in
            let associated = { (card: PhoneCard) in card.taskID == task.id || card.id == task.waitingCardId }
            let authorWorking = task.status == "active" && (task.workPosture?.state == "active"
                || (task.workPosture == nil && task.activity == "running")
                || cards.contains { associated($0) && $0.awaiting == "answer" })
            var shown = task
            shown.minimizedCardId = authorWorking ? nil : cards.first { $0.minimized && associated($0) }?.id
            return shown
        }
        return board
    }

    /// The cards put aside that belong to no task here, each listed as its own row titled by the card, as the Mac's
    /// `presentBoard` does; a card whose task the board does not hold gets none.
    public func tasklessMinimized(_ cards: [PhoneCard]) -> [PhoneCard] {
        cards.filter { card in
            card.minimized && card.taskID == nil && !tasks.contains { $0.minimizedCardId == card.id }
        }
    }

    /// The minimized cards a task's row brings back: every card of the task put aside, as the Mac's row does.
    public static func minimized(of task: PhoneTask, in cards: [PhoneCard]) -> [PhoneCard] {
        cards.filter { $0.minimized && ($0.taskID == task.id || $0.id == task.waitingCardId || $0.id == task.minimizedCardId) }
    }

    /// INF-3588: what a task's row shows once it has brought back the cards put aside named in `back`, in the Mac's
    /// `openTask` order (src/renderer/src/plugins/point/openTask.ts): the decision the task waits on; a required step the
    /// captain put off, shown again only by a phone that can make changes; the newest card the task owns or waits on that
    /// is on the stack, finished being written and not ended; then the task's record. A first mate question shows its
    /// record instead, since its card names no task and offers no way to it on the phone yet (INF-2928, INF-2941).
    public static func opening(_ task: PhoneTask, in cards: [PhoneCard], back: Set<String> = [], canChange: Bool) -> PhoneRowOpening {
        let stack = cards.filter { card in
            (card.taskID == task.id || card.id == task.waitingCardId)
                && (card.awaiting == nil || card.sentBackAt != nil) && (!card.minimized || back.contains(card.id))
        }
        let waiting = task.waitingCardId != nil && (task.status == "open" || task.status == "active")
            ? stack.first { $0.awaiting == nil && !$0.actions.isEmpty } : nil
        if waiting == nil, task.status == "open", canChange,
           let state = task.requiredAction?.state, state == "ready" || state == "deferred" {
            return .showCard
        }
        func created(_ card: PhoneCard) -> Double { card.value["createdAt"].numeric ?? 0 }
        let newest = stack.reduce(nil as PhoneCard?) { newest, card in
            let later = newest.map { created(card) > created($0) } ?? true
            return later && card.value["status"].text != "streaming" && card.value["ended"] == .null ? card : newest
        }
        guard let shown = waiting ?? newest else { return .record }
        return task.kind == "decision" && shown.isFirstmateOwn ? .record : .card(shown.id)
    }

    /// Keep a working parent and its live parts together, as the Mac's Tasks panel does (`nowGroupsOf`): the tree is live
    /// work only, so a closed part keeps its own group and Working never lists finished work.
    public var groups: [String: PhoneTaskGroup] {
        let byID = Dictionary(tasks.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        func live(_ task: PhoneTask?) -> PhoneTask? { task.flatMap { $0.status == "done" || $0.status == "dropped" ? nil : $0 } }
        func liveParent(_ task: PhoneTask) -> PhoneTask? { live(task.parentId.flatMap { byID[$0] }) }
        var working = Set<String>()
        for task in tasks where task.group == .working {
            var member = live(task)
            while let next = member, working.insert(next.id).inserted { member = liveParent(next) }
        }
        for task in tasks where live(task) != nil {
            var member = liveParent(task)
            var visited = Set<String>()
            while let next = member, visited.insert(next.id).inserted {
                if working.contains(next.id) { working.insert(task.id); break }
                member = liveParent(next)
            }
        }
        return Dictionary(uniqueKeysWithValues: tasks.compactMap { task in
            guard let group = task.group else { return nil }
            return (task.id, working.contains(task.id) && group != .waiting ? .working : group)
        })
    }
}

/// What changed between two boards, as the Mac pushes it above its delta trigger (`taskBoardDeltaSchema`).
public struct PhoneBoardDelta: Decodable, Sendable {
    public let baseSeq: Int
    public let seq: Int
    public let upserts: [PhoneTask]
    public let removed: [String]
    public let projects: [PhoneBoard.Project]
    public let links: Links
    public struct Links: Decodable, Sendable { public let added: [PhoneBoard.Link]; public let removed: [PhoneBoard.Link] }
}

public struct PhoneCrew: Decodable, Sendable {
    public let taskId: String
    public let earlier: Int
    public let lines: [Line]
    public struct Line: Decodable, Identifiable, Sendable {
        public let id: String
        public let kind: String
        public let text: String?
        public let title: String?
        public let summary: String?
        public let from: String?
        public let name: String?
        public let target: String?
        public let reading: String?
        public let result: Result?
        public var words: String {
            text ?? title ?? reading ?? (kind == "compacted" ? PhoneMessages.phoneWorkPlaceCompacted() : kind == "stopped" ? PhoneMessages.phoneWorkPlaceStopped() : kind)
        }
        public struct Result: Decodable, Sendable {
            public let ref: String
            public let preview: String
            public let lines: Int
        }
    }
}

public struct PhoneCrewLive: Decodable, Sendable {
    public let text: String
    public let since: Double?
}
public struct PhoneResultText: Decodable, Sendable {
    public let text: String
    public let cut: Int
}

public struct PhoneAnswer: Decodable, Sendable {
    public let ok: Bool
    public let text: String?
    public func accepted() throws {
        if !ok { throw PhoneError.refused(text ?? PhoneMessages.phoneSessionChangeFailed()) }
    }
}

extension PhoneTask.ActivityRow {
    private enum Keys: String, CodingKey { case id, at, kind, text, from, actions, folded, said, saidHere }

    /// Its words in the phone's language from the fact beside them (`PhoneWords.line`).
    public init(from decoder: Decoder) throws {
        let row = try decoder.container(keyedBy: Keys.self)
        self.init(
            id: try row.decodeIfPresent(Int.self, forKey: .id), at: try row.decode(Double.self, forKey: .at),
            kind: try row.decode(String.self, forKey: .kind),
            text: try PhoneWords.line(row, text: .text, said: .said, here: .saidHere, decoder: decoder),
            from: try row.decodeIfPresent(From.self, forKey: .from), actions: try row.decodeIfPresent([PhoneTask.ActionLine].self, forKey: .actions),
            folded: try row.decodeIfPresent([Folded].self, forKey: .folded))
    }
}

extension PhoneTask.ActivityRow.Folded {
    private enum Keys: String, CodingKey { case at, kind, text, said, saidHere }

    public init(from decoder: Decoder) throws {
        let line = try decoder.container(keyedBy: Keys.self)
        self.init(
            at: try line.decode(Double.self, forKey: .at), kind: try line.decode(String.self, forKey: .kind),
            text: try PhoneWords.line(line, text: .text, said: .said, here: .saidHere, decoder: decoder))
    }
}

extension PhoneTask.ActionLine {
    private enum Keys: String, CodingKey { case at, text, said, saidHere }

    public init(from decoder: Decoder) throws {
        let line = try decoder.container(keyedBy: Keys.self)
        self.init(at: try line.decode(Double.self, forKey: .at), text: try PhoneWords.line(line, text: .text, said: .said, here: .saidHere, decoder: decoder))
    }
}
