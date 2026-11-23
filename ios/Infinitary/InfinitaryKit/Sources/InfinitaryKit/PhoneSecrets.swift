import Foundation
import Observation

/// What the home says of this phone's Secrets approvals (`inf:secrets:approvals`).
public struct PhoneApprovals: Decodable, Sendable, Equatable {
    public struct Enrollment: Decodable, Sendable, Equatable {
        public let label: String
        public let generation: Int
        /// The approval key the home holds for this phone, SPKI DER, base64.
        public let key: String
    }
    /// One requested secret as the use prepared it: the captain's own name for it, the environment label that
    /// tells two secrets with the same name apart, and the reference and version this use reads. Never its value.
    public struct Secret: Decodable, Sendable, Equatable {
        public let ref: String
        public let label: String
        public let version: Int
        /// The captain's own label for where it belongs, such as Staging; empty when they gave none.
        public let environment: String
        /// The name the computer's own card gives it among every saved secret: its place only when another saved
        /// secret shares its name, its reference only when both repeat. Nil from an older computer.
        public let name: String?
    }
    public struct Fact: Decodable, Sendable, Equatable { public let name: String; public let value: String }
    /// One waiting use, described as the home's approval card describes it.
    public struct Use: Decodable, Sendable, Equatable, Identifiable {
        public let request: String
        public let card: String?
        public let digest: String
        public let expires: Int64
        public let nonce: String?
        public let reason: String
        public let recipient: String
        /// The title of the task that asked; nil when no task asked, or from a computer that does not say.
        public let task: String?
        public let secrets: [Secret]
        public let facts: [Fact]
        public var id: String { request }
        /// What tells one requested secret apart, after its name: its environment when there is one, and its
        /// reference only when another secret of this use shares its name and environment. INF-1690's plan names
        /// a secret by its name and place, never by a reference or version it does not need.
        public func detail(_ secret: Secret) -> [String] {
            let twin = secrets.contains { $0.ref != secret.ref && $0.label == secret.label && $0.environment == secret.environment }
            return (secret.environment.isEmpty ? [] : [secret.environment]) + (twin ? [secret.ref] : [])
        }
        /// How the phone names a requested secret wherever it asks: as the computer's card names it, so the title,
        /// the foot and the confirmation agree; from an older computer, the name first, then what tells it apart.
        public func named(_ secret: Secret) -> String {
            if let name = secret.name { return name }
            let detail = detail(secret)
            return detail.isEmpty ? secret.label : "\(secret.label) (\(detail.joined(separator: ", ")))"
        }
        /// The sentence the system's confirmation shows, naming exactly what this Allow gives and to whom.
        public var giving: String {
            PhoneMessages.phoneSecretsGiveOnce(recipient: task ?? recipient, secrets: secrets.map(named).joined(separator: ", "))
        }
    }
    public let availability: String
    public let home: String?
    public let device: Enrollment?
    public let offered: Bool
    /// The person turned this phone's Approves secret uses switch on in Settings → Devices on the computer, so this
    /// phone offers its key now. An older home never says it.
    public let asked: Bool?
    public let waiting: [Use]
}

/// This phone's side of Secrets approvals: its key, its enrollment on the home and its decisions. The home
/// decides; the phone only offers its key, signs an Allow the person confirmed, or refuses.
@MainActor @Observable public final class PhoneSecrets {
    public private(set) var approvals: PhoneApprovals?
    public private(set) var key: ApprovalKey?
    /// The damaged record this phone last read in place of a key, which only `setUpAgain` replaces.
    public private(set) var damage: ApprovalKey.Damage?
    public private(set) var problem: String?
    public private(set) var busy = false
    /// The name this phone offers with its key, the same one it joined with: iPhone or iPad.
    public let label: String
    @ObservationIgnored private let session: any SecretsHome
    @ObservationIgnored private let loadKey: () throws -> ApprovalKey?
    @ObservationIgnored private let createKey: () throws -> ApprovalKey
    @ObservationIgnored private let replaceKey: (ApprovalKey.Damage) throws -> ApprovalKey
    @ObservationIgnored private var loaded = false
    @ObservationIgnored private var reading = 0
    /// The offer this phone makes by itself when the computer asks. It runs on its own, as the switch's does: the
    /// card it raises pushes a Secrets change, whose read takes over from the one which started it.
    @ObservationIgnored private(set) var asking: Task<Void, Never>?
    /// The newest read a change notice started (`changed`).
    @ObservationIgnored private(set) var rereading: Task<Void, Never>?

    public convenience init(session: ReadOnlySession, label: String, loadKey: @escaping () throws -> ApprovalKey? = ApprovalKey.load,
                            createKey: @escaping () throws -> ApprovalKey = ApprovalKey.create,
                            replaceKey: @escaping (ApprovalKey.Damage) throws -> ApprovalKey = ApprovalKey.replace) {
        self.init(home: session, label: label, loadKey: loadKey, createKey: createKey, replaceKey: replaceKey)
        session.onSecretsChanged = { [weak self] in self?.changed() }
    }

    init(home: any SecretsHome, label: String = "iPhone", loadKey: @escaping () throws -> ApprovalKey?,
         createKey: @escaping () throws -> ApprovalKey, replaceKey: @escaping (ApprovalKey.Damage) throws -> ApprovalKey) {
        self.session = home; self.label = label; self.loadKey = loadKey; self.createKey = createKey; self.replaceKey = replaceKey
    }

    public enum Standing: Equatable { case unavailable, none, damaged, offered, enrolled, replaced }
    /// Where this phone stands: enrolled only while the home holds this phone's own key, and nothing to set
    /// up until Secrets on the computer is set up and open.
    public var standing: Standing {
        guard let approvals, approvals.availability == "available" else { return .unavailable }
        if key == nil, damage != nil { return .damaged }
        if approvals.offered { return .offered }
        guard let enrolled = approvals.device else { return .none }
        return enrolled.key == key?.publicKey ? .enrolled : .replaced
    }

    /// The waiting use the home raised this card for, if it is one.
    public func use(card: String) -> PhoneApprovals.Use? { approvals?.waiting.first { $0.card == card } }

    /// Whether this phone can allow this use itself: it is enrolled and the home gave it this use's challenge.
    public func allows(_ use: PhoneApprovals.Use) -> Bool { standing == .enrolled && use.nonce != nil }

    /// What a press on one of a use card's own choices does here (docs/secrets.md, "Remote decisions").
    public enum Choice: Equatable, Sendable {
        /// The phone confirms the person and signs an Allow once with its own key.
        case allow
        /// The phone refuses; a refusal needs no key.
        case deny
        /// An Allow once on a phone not enrolled: the press says where to set up, or to allow on the computer.
        case setUpFirst
        /// A lasting or short allowance, which only the computer's own confirmation saves.
        case onComputer

        /// What a press says instead of deciding, for a choice made elsewhere.
        public func notice(computer: String) -> String? {
            switch self {
            case .allow, .deny: return nil
            case .setUpFirst: return PhoneMessages.phoneCardsApprovalTurnOn(computer: computer)
            case .onComputer: return PhoneMessages.phoneCardsDoThisOn(computer: computer)
            }
        }

        /// The choice's name for UI tests: the phone's own Allow once and Don't allow keep theirs, and any other
        /// choice is named by its pass, as every card's choices are.
        public func identifier(_ pass: String?) -> String {
            self == .allow ? "approval-allow" : self == .deny ? "approval-deny" : "card-action-\(pass ?? "")"
        }
    }

    /// The phone keeps every choice the computer's card carries and reads which answer each gives from the start of
    /// its pass (`allow-once:<id>`, the computer's SECRET_USE_ANSWERS), so a choice it cannot make here stays
    /// drawn and says where to make it instead of vanishing.
    public func choice(_ pass: String?, for use: PhoneApprovals.Use) -> Choice {
        switch pass?.split(separator: ":", maxSplits: 1).first {
        case "deny": return .deny
        case "allow-once": return allows(use) ? .allow : .setUpFirst
        default: return .onComputer
        }
    }

    /// The home's Secrets changed, or contact came back: every notice starts a read of its own, and only the newest
    /// read's answer stands (`reading`), so changes that arrive together end at the home's last answer (INF-4168).
    func changed() {
        rereading = Task { await read() }
    }

    /// Reads the home's answer again. A home without phone approvals refuses the read, and the phone shows none.
    /// When the person turned this phone's switch on at the computer (INF-1690 piece 4), the phone offers its key
    /// at once, as its own switch does: the computer then shows the code to compare, and nothing is enrolled until
    /// the person confirms there. A key the home holds without knowing which paired phone it belongs to is offered
    /// again so the home can link it, through the same comparison. A damaged record waits for the person's choice.
    public func read() async {
        if !loaded { loadKept() }
        reading += 1
        let current = reading
        do {
            let answer = try await session.request(.secretApprovals, args: [["device": key?.device ?? Self.unenrolled]], as: PhoneApprovals.self)
            guard current == reading else { return }
            approvals = answer
            if answer.asked == true, !busy, [.none, .replaced, .enrolled].contains(standing) {
                asking = Task { await self.setUp(label: self.label) }
            }
        } catch {
            if current == reading { approvals = nil }
        }
    }

    /// Offers this phone's key to the home, which asks the captain to compare the code and confirm there.
    /// A phone whose enrollment the home no longer holds offers a new key. A kept key the phone could not read
    /// before, as while it was locked, is read again first, so the home keeps the enrollment it holds.
    public func setUp(label: String) async {
        guard !busy else { return }
        busy = true; problem = nil
        defer { busy = false }
        do {
            if key == nil, !loaded { key = try keptKey(); damage = nil; loaded = true }
            if key == nil || standing == .replaced { key = try createKey(); loaded = true }
            try await offer(label: label)
        } catch PhoneError.damagedApproval(let found) { damage = found }
        catch { problem = error.localizedDescription }
    }

    /// Set up approvals again, the person's choice for a damaged record. Only the damaged record this phone
    /// read is replaced, by a new key under a new device name, which the home enrolls like a first key: the
    /// person compares its code and confirms on the computer. An earlier enrollment the home holds stays
    /// there, and nothing it allowed carries over. When the replacement is refused, the phone reads its
    /// record again and shows what it keeps now.
    public func setUpAgain(label: String) async {
        guard !busy, let damage else { return }
        busy = true; problem = nil
        defer { busy = false }
        do {
            key = try replaceKey(damage)
        } catch {
            let refusal = error.localizedDescription
            loaded = false
            await read()
            problem = refusal
            return
        }
        self.damage = nil; loaded = true
        do { try await offer(label: label) } catch { problem = error.localizedDescription }
    }

    private func offer(label: String) async throws {
        guard let key else { return }
        approvals = try await session.request(.secretEnroll, args: [["device": key.device, "label": label, "key": key.publicKey]], as: PhoneApprovals.self)
    }

    /// Reads the kept key. A damaged record is its own state and is kept as it is; any other failure is a
    /// problem to show, never an absence.
    private func loadKept() {
        do { key = try loadKey(); damage = nil; loaded = true; problem = nil }
        catch PhoneError.damagedApproval(let found) { key = nil; damage = found; problem = nil }
        catch { problem = error.localizedDescription }
    }

    /// The key this phone keeps, or nil when it keeps none or only a record it refuses, which a new key replaces.
    /// A Keychain it cannot read now is an error, never a reason to replace the key, and so is a damaged record.
    private func keptKey() throws -> ApprovalKey? {
        do { return try loadKey() } catch PhoneError.unusableApproval { return nil }
    }

    /// The result of one decision, in the words the phone shows.
    public enum Outcome: Equatable {
        case accepted, stillWaiting, refused(String)

        /// A receipt is not acceptance of a different choice, nor permission to repeat an uncertain use.
        init(state: String, allowing: Bool) {
            if (allowing && ["executing", "completed"].contains(state)) || (!allowing && state == "denied") {
                self = .accepted
            } else if state == "waiting" {
                self = .stillWaiting
            } else {
                let words: String
                switch state {
                case "unavailable": words = PhoneMessages.phoneSecretsRefusedUnavailable()
                case "expired": words = PhoneMessages.phoneSecretsRefusedExpired()
                case "denied": words = PhoneMessages.phoneSecretsRefusedDenied()
                case "cancelled", "invalidated": words = PhoneMessages.phoneSecretsRefusedGone()
                case "executing", "completed": words = PhoneMessages.phoneSecretsRefusedStarted()
                default: words = PhoneMessages.phoneSecretsRefusedUnknown()
                }
                self = .refused(words)
            }
        }
    }

    /// Allows one use: the person confirms now, and the signature covers this home, request, digest,
    /// challenge, expiry and decision. Nothing is sent when the confirmation fails.
    public func allow(_ use: PhoneApprovals.Use) async throws -> Outcome {
        guard let key, standing == .enrolled, let enrolled = approvals?.device, let home = approvals?.home, let nonce = use.nonce
        else { throw PhoneError.refused(PhoneMessages.phoneSecretsTurnOnFirst()) }
        let message = PhoneDecision.message(home: home, device: key.device, generation: enrolled.generation,
            request: use.request, digest: use.digest, nonce: nonce, expires: use.expires)
        let signature = try await key.sign(message, reason: use.giving)
        return try await decide(["kind": "allow", "request": use.request, "device": key.device,
            "generation": enrolled.generation, "nonce": nonce, "signature": signature])
    }

    /// Decides one use by a choice the phone makes itself: Allow once signs and Don't allow refuses. A choice made
    /// elsewhere sends nothing.
    public func decide(_ choice: Choice, _ use: PhoneApprovals.Use) async throws -> Outcome {
        switch choice {
        case .allow: return try await allow(use)
        case .deny: return try await deny(use)
        case .setUpFirst, .onComputer: throw PhoneError.refused(PhoneMessages.phoneSecretsTurnOnFirst())
        }
    }

    /// Refuses one use. A refusal needs no key.
    public func deny(_ use: PhoneApprovals.Use) async throws -> Outcome {
        try await decide(["kind": "deny", "request": use.request])
    }

    private func decide(_ decision: [String: Any]) async throws -> Outcome {
        struct Decided: Decodable { let state: String }
        let decided = try await session.request(.secretDecide, args: [decision], as: Decided.self)
        await read()
        return Outcome(state: decided.state, allowing: decision["kind"] as? String == "allow")
    }

    /// A device name no phone keeps, for reading before this phone has a key.
    static let unenrolled = "unenrolled"
}

/// What this phone's approvals ask of the home: the session to the joined computer. Tests give a stand-in home.
@MainActor protocol SecretsHome: AnyObject {
    func request<T: Decodable & Sendable>(_ channel: PhoneRequest, args: [Any], as: T.Type) async throws -> T
}

extension ReadOnlySession: SecretsHome {}
