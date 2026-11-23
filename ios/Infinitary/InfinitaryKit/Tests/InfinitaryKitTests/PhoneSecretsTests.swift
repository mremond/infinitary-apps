import Foundation
import Security
import Testing
@testable import InfinitaryKit

/// INF-1250's finding in INF-1109's PhoneSecrets: a phone that could not read its kept approval key while it was
/// locked reads that key again when the person turns on Approves secret uses once it is unlocked, so the computer keeps
/// the enrollment it holds instead of asking to enroll a replacement. Only a record the phone refuses is replaced.
/// The Keychain stand-in answers as the phone's Keychain does; the home stand-in answers as the home's
/// SecretsSettings.approvals and enroll do (src/core/secrets/settings.ts).
@MainActor struct PhoneSecretsTests {
    /// One computer with Secrets set up and open. It offers to enroll a key only when it does not already hold
    /// that key for that device, and says which key it holds for the device a phone names.
    @MainActor final class Home: SecretsHome {
        var enrolled: (device: String, key: String)?
        /// The uses waiting now, each as SecretsSettings.approvals describes it.
        var waiting: [[String: Any]] = []
        /// The person turned this phone's switch on in Settings → Devices, as SecretsSettings.approvals says.
        var asked: Bool?
        private(set) var offered: [String] = []
        /// Runs when a key is offered, before the answer arrives: the home's card raises a Secrets change then.
        var onEnroll: () -> Void = {}
        /// While set, each approvals read takes the answer as the home holds it when asked, and sends it only when
        /// `answerHeld` lets it go: the home answers each read on its own, in any order.
        var holdsReads = false
        private var held: [CheckedContinuation<Void, Never>?] = []
        var heldReads: Int { held.count }
        func answerHeld(_ read: Int) { held[read]?.resume(); held[read] = nil }

        func request<T: Decodable & Sendable>(_ channel: PhoneRequest, args: [Any], as: T.Type) async throws -> T {
            let input = try #require(args.first as? [String: Any])
            let device = try #require(input["device"] as? String)
            switch channel {
            case .secretApprovals: break
            case .secretEnroll:
                let key = try #require(input["key"] as? String)
                if enrolled?.device != device || enrolled?.key != key || asked == true { offered.append(key) }
                onEnroll()
            default: throw PhoneError.invalidReply
            }
            let holds = enrolled.flatMap { $0.device == device ? $0 : nil }
            let answer: [String: Any] = [
                "availability": "available", "home": "c41a5779-70bc-400b-929d-19f4c4ed06ea",
                "device": holds.map { ["label": "iPhone", "generation": 1, "key": $0.key] as [String: Any] } ?? NSNull(),
                "offered": !offered.isEmpty, "waiting": waiting,
            ].merging(asked.map { ["asked": $0] } ?? [:]) { $1 }
            if holdsReads, channel == .secretApprovals { await withCheckedContinuation { held.append($0) } }
            // As ReadOnlySession.request: an answer that arrives after its caller was cancelled is not taken.
            try Task.checkCancellation()
            return try JSONDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: answer))
        }
    }

    /// The phone's approvals over a Keychain stand-in, as a simulator keeps them.
    static func secrets(_ home: Home, _ keychain: ApprovalStorageTests.Keychain) -> PhoneSecrets {
        PhoneSecrets(home: home, loadKey: { try ApprovalKey.load(on: .simulator, from: keychain) },
                     createKey: { try ApprovalKey.create(on: .simulator, in: keychain) },
                     replaceKey: { try ApprovalKey.replace($0, on: .simulator, in: keychain) })
    }

    /// INF-3042: a later successful key read removes the earlier locked-store explanation without replacing the key.
    @Test func readingAfterUnlockClearsTheObsoleteProblem() async throws {
        let keychain = ApprovalStorageTests.Keychain()
        let kept = try ApprovalKey.create(on: .simulator, in: keychain)
        let writes = keychain.writes
        let home = Home()
        home.enrolled = (kept.device, kept.publicKey)
        let secrets = Self.secrets(home, keychain)
        keychain.reading = errSecInteractionNotAllowed
        await secrets.read()
        #expect(secrets.problem == ApprovalKey.notKept)
        keychain.reading = errSecSuccess
        await secrets.read()
        #expect(secrets.key == kept)
        #expect(secrets.problem == nil)
        #expect(secrets.standing == .enrolled)
        #expect(keychain.writes == writes)
    }

    /// INF-1690 piece 4, the captain's pick: "In Devices, as a switch on the paired iPhone: Approves key uses. The code
    /// comparison stays as the one confirmation, with the same key underneath." When the computer says the switch was
    /// turned on there, the phone offers its key by itself, once, and the computer's code card does the rest. A home
    /// that never says so (an older one) or says no gets nothing offered.
    @Test func theComputersSwitchOffersThisPhonesKey() async throws {
        let keychain = ApprovalStorageTests.Keychain()
        let home = Home()
        let secrets = Self.secrets(home, keychain)
        await secrets.read()
        #expect(secrets.standing == .none)
        home.asked = false
        await secrets.read()
        #expect(home.offered.isEmpty, "Nothing is offered until the computer asks")

        home.asked = true
        await secrets.read()
        await secrets.asking?.value
        let key = try #require(secrets.key)
        #expect(home.offered == [key.publicKey])
        #expect(secrets.standing == .offered)
        await secrets.read()
        #expect(home.offered == [key.publicKey], "An offer the computer holds is not made again")
    }

    /// INF-1690 piece 4: a key the computer holds from before it recorded which paired phone offered it is offered
    /// again when the computer asks, the same key, so the computer can link it through the same code comparison.
    @Test func anEnrolledKeyIsOfferedAgainWhenTheComputerAsks() async throws {
        let keychain = ApprovalStorageTests.Keychain()
        let kept = try ApprovalKey.create(on: .simulator, in: keychain)
        let writes = keychain.writes
        let home = Home()
        home.enrolled = (kept.device, kept.publicKey)
        home.asked = true
        let secrets = Self.secrets(home, keychain)
        await secrets.read()
        await secrets.asking?.value
        #expect(home.offered == [kept.publicKey])
        #expect(keychain.writes == writes, "The same key underneath")
    }

    /// INF-3506's finding: the code card the offer raises pushes a Secrets change, which cancels the read that saw
    /// the computer's ask. The offer still completes, and the phone shows no problem.
    @Test func theCardsOwnChangeDoesNotCancelTheOffer() async throws {
        let keychain = ApprovalStorageTests.Keychain()
        let home = Home()
        home.asked = true
        let secrets = Self.secrets(home, keychain)
        let reading = Task { await secrets.read() }
        home.onEnroll = { reading.cancel() }
        await reading.value
        await secrets.asking?.value
        let key = try #require(secrets.key)
        #expect(home.offered == [key.publicKey])
        #expect(secrets.problem == nil)
        #expect(secrets.standing == .offered)
    }

    /// INF-4168: the computer stopped approvals from this phone and another device, four Secrets changes in one frame.
    /// The phone read again through a view task restarted on each change, which SwiftUI skipped for the last one, so
    /// Settings kept saying this phone approves. Each change now starts its own read, and the last change's answer
    /// stands even when the earlier reads answer after it.
    @Test func changesThatArriveTogetherEndAtTheLastAnswer() async throws {
        let keychain = ApprovalStorageTests.Keychain()
        let kept = try ApprovalKey.create(on: .simulator, in: keychain)
        let home = Home()
        home.enrolled = (kept.device, kept.publicKey)
        let secrets = Self.secrets(home, keychain)
        await secrets.read()
        #expect(secrets.standing == .enrolled)

        // Stop approvals for each device: the question asked, then the answer saved, each announced as a change.
        // This phone's enrollment ends with the last change.
        home.holdsReads = true
        var reads: [Task<Void, Never>] = []
        for change in 1...4 {
            if change == 4 { home.enrolled = nil }
            secrets.changed()
            reads.append(try #require(secrets.rereading))
            // The read runs on this actor: it reaches the home once this test lets the actor go, at most a few turns.
            for _ in 0..<100 where home.heldReads < change { await Task.yield() }
            try #require(home.heldReads == change, "Each change reaches the home with a read of its own")
        }
        for read in reads.indices.reversed() {
            home.answerHeld(read)
            await reads[read].value
        }
        #expect(secrets.approvals?.device == nil)
        #expect(secrets.standing == .none, "The switch reads off once the computer stopped this phone's approvals")
    }

    /// INF-3042: real Secrets receipt states distinguish acceptance from waiting, refusal and uncertainty.
    @Test func onlyTheRequestedDecisionIsAccepted() {
        for state in ["executing", "completed"] {
            #expect(PhoneSecrets.Outcome(state: state, allowing: true) == .accepted)
            if case .refused = PhoneSecrets.Outcome(state: state, allowing: false) {} else { Issue.record("A running use cannot be denied") }
        }
        #expect(PhoneSecrets.Outcome(state: "denied", allowing: false) == .accepted)
        for allowing in [true, false] {
            #expect(PhoneSecrets.Outcome(state: "waiting", allowing: allowing) == .stillWaiting)
            for state in ["unavailable", "expired", "cancelled", "invalidated", "unknown"] {
                if case .refused = PhoneSecrets.Outcome(state: state, allowing: allowing) {} else { Issue.record("A refused or uncertain receipt is not acceptance") }
            }
        }
        if case .refused = PhoneSecrets.Outcome(state: "denied", allowing: true) {} else { Issue.record("Denied is not Allow") }
    }

    @Test func settingUpOnceUnlockedKeepsTheEnrolledKey() async throws {
        let keychain = ApprovalStorageTests.Keychain()
        let kept = try ApprovalKey.create(on: .simulator, in: keychain)
        let record = try #require(keychain.record)
        let writes = keychain.writes
        let home = Home()
        home.enrolled = (kept.device, kept.publicKey)
        let secrets = Self.secrets(home, keychain)

        // The phone is locked when it first reads: it holds no key, so Settings shows the Approves secret uses switch off.
        keychain.reading = errSecInteractionNotAllowed
        await secrets.read()
        #expect(secrets.key == nil)
        #expect(secrets.standing == .none)
        #expect(secrets.problem == ApprovalKey.notKept)

        // Still locked: the tap says so, and nothing is written or offered.
        await secrets.setUp(label: "iPhone")
        #expect(secrets.problem == ApprovalKey.notKept)
        #expect(keychain.writes == writes)
        #expect(home.offered.isEmpty)

        // Unlocked: the tap reads the kept key, and the computer still holds it.
        keychain.reading = errSecSuccess
        await secrets.setUp(label: "iPhone")
        #expect(secrets.problem == nil)
        #expect(secrets.key == kept)
        #expect(secrets.standing == .enrolled)
        #expect(home.offered.isEmpty, "The computer asks to enroll nothing new")
        #expect(keychain.writes == writes, "The kept key is not replaced")
        #expect(keychain.record == record)
    }

    @Test func settingUpReplacesARecordThePhoneRefuses() async throws {
        // A software record on a physical device is refused for good, not unreadable for now.
        let keychain = ApprovalStorageTests.Keychain()
        let kept = try ApprovalKey.create(on: .simulator, in: keychain)
        let writes = keychain.writes
        let home = Home()
        home.enrolled = (kept.device, kept.publicKey)
        // This Mac reaches no Secure Enclave, so a simulator key stands in for the device's new one.
        let secrets = PhoneSecrets(home: home, loadKey: { try ApprovalKey.load(on: .device, from: keychain) },
                                   createKey: { try ApprovalKey.create(on: .simulator, in: keychain) },
                                   replaceKey: { try ApprovalKey.replace($0, on: .simulator, in: keychain) })

        await secrets.read()
        #expect(secrets.key == nil)
        #expect(secrets.problem == ApprovalKey.unusable)

        await secrets.setUp(label: "iPhone")
        let replacement = try #require(secrets.key)
        #expect(secrets.problem == nil)
        #expect(replacement.device == kept.device)
        #expect(replacement.publicKey != kept.publicKey)
        #expect(keychain.writes == writes + 1)
        #expect(home.offered == [replacement.publicKey])
        #expect(secrets.standing == .offered)
    }

    /// INF-1109's decision on a damaged record: Settings says so and offers Set up approvals again, and only that
    /// choice replaces the record. The new key takes a new device name, so the computer asks for its code
    /// comparison and confirmation as for a first key, and the earlier enrollment stays on the computer.
    @Test func onlySetUpApprovalsAgainReplacesADamagedRecord() async throws {
        let keychain = ApprovalStorageTests.Keychain()
        let kept = try ApprovalKey.create(on: .simulator, in: keychain)
        let damaged = try #require(keychain.record).prefix(20)
        keychain.record = damaged
        let writes = keychain.writes
        let home = Home()
        home.enrolled = (kept.device, kept.publicKey)
        let secrets = Self.secrets(home, keychain)

        await secrets.read()
        #expect(secrets.standing == .damaged)
        #expect(secrets.key == nil)
        #expect(secrets.problem == nil, "A damaged record is not a phone to unlock")

        // Turning on Approves secret uses refuses the damaged record: nothing is written or offered.
        await secrets.setUp(label: "iPhone")
        #expect(secrets.standing == .damaged)
        #expect(secrets.problem == nil)
        #expect(keychain.writes == writes)
        #expect(keychain.record == damaged)
        #expect(home.offered.isEmpty)

        await secrets.setUpAgain(label: "iPhone")
        let fresh = try #require(secrets.key)
        #expect(secrets.problem == nil)
        #expect(fresh.device != kept.device)
        #expect(keychain.writes == writes + 1)
        #expect(try ApprovalKey.load(on: .simulator, from: keychain) == fresh)
        #expect(home.offered == [fresh.publicKey], "The computer asks to enroll the new key")
        #expect(secrets.standing == .offered)
        #expect(home.enrolled?.device == kept.device, "The earlier enrollment stays on the computer")
    }

    @Test func aRefusedSetUpAgainKeepsTheDamagedRecord() async throws {
        let keychain = ApprovalStorageTests.Keychain()
        _ = try ApprovalKey.create(on: .simulator, in: keychain)
        let damaged = try #require(keychain.record).prefix(20)
        keychain.record = damaged
        let writes = keychain.writes
        let home = Home()
        let secrets = Self.secrets(home, keychain)
        await secrets.read()
        #expect(secrets.standing == .damaged)

        // A write that fails leaves the damaged bytes, and Settings still offers the same choice.
        keychain.writing = errSecInteractionNotAllowed
        await secrets.setUpAgain(label: "iPhone")
        #expect(secrets.problem == ApprovalKey.notKept)
        #expect(secrets.standing == .damaged)
        #expect(secrets.key == nil)
        #expect(keychain.record == damaged)
        #expect(keychain.writes == writes + 1)
        #expect(home.offered.isEmpty)

        // Locked by the time of the tap: nothing is written, and the damaged record stays.
        keychain.writing = errSecSuccess
        keychain.reading = errSecInteractionNotAllowed
        await secrets.setUpAgain(label: "iPhone")
        #expect(secrets.problem == ApprovalKey.notKept)
        #expect(secrets.standing == .damaged)
        #expect(keychain.record == damaged)
        #expect(keychain.writes == writes + 1)
        #expect(home.offered.isEmpty)
    }

    @Test func aPhoneThatCannotReadItsRecordNeverOffersToSetUpAgain() async throws {
        let keychain = ApprovalStorageTests.Keychain()
        _ = try ApprovalKey.create(on: .simulator, in: keychain)
        let damaged = try #require(keychain.record).prefix(20)
        keychain.record = damaged
        keychain.reading = errSecInteractionNotAllowed
        let writes = keychain.writes
        let home = Home()
        let secrets = Self.secrets(home, keychain)

        await secrets.read()
        #expect(secrets.standing == .none)
        #expect(secrets.damage == nil)
        #expect(secrets.problem == ApprovalKey.notKept)
        await secrets.setUpAgain(label: "iPhone")
        await secrets.setUp(label: "iPhone")
        #expect(secrets.problem == ApprovalKey.notKept)
        #expect(secrets.standing == .none)
        #expect(keychain.writes == writes)
        #expect(keychain.record == damaged)
        #expect(home.offered.isEmpty)
    }

    /// INF-1109, the captain: "right now it's not even clear what secrets are being requested". Two secrets the
    /// captain gave the same name stay apart by environment wherever the phone names a use, including the
    /// confirmation the system shows before the key signs, and a reading that leaves out a secret's reference
    /// shows no use at all. INF-1690's accepted plan names a secret without its reference or version, and the
    /// task that asked, unless two secrets of one use share a name and environment.
    @Test func aWaitingUseNamesEachSecretByItsPlace() async throws {
        let home = Home()
        let use: [String: Any] = [
            "request": "use-7f3a", "card": "card-secrets-use-7f3a", "digest": "5b0c1d", "expires": 1792900300000,
            "nonce": NSNull(), "reason": "Publish the staging build", "recipient": "Staging deploy check",
            "task": "Publish the staging build",
            "secrets": [
                ["ref": "github-token-2", "label": "GitHub token", "version": 3, "environment": "Production"],
                ["ref": "github-token", "label": "GitHub token", "version": 1, "environment": "Staging"],
                ["ref": "notes", "label": "Notes key", "version": 2, "environment": ""],
            ],
            "facts": [["name": "Destination", "value": "https://deploy.example.test/status"]],
        ]
        home.waiting = [use]
        let secrets = Self.secrets(home, ApprovalStorageTests.Keychain())
        await secrets.read()
        let read = try #require(secrets.use(card: "card-secrets-use-7f3a"))
        #expect(read.secrets.map(read.named) == ["GitHub token (Production)", "GitHub token (Staging)", "Notes key"])
        #expect(read.giving == "Give GitHub token (Production), GitHub token (Staging), Notes key to Publish the staging build once")

        var twins = use
        twins["task"] = NSNull()
        twins["secrets"] = [
            ["ref": "github-token-2", "label": "GitHub token", "version": 3, "environment": "Production"],
            ["ref": "github-token", "label": "GitHub token", "version": 1, "environment": "Production"],
        ]
        home.waiting = [twins]
        await secrets.read()
        let alike = try #require(secrets.use(card: "card-secrets-use-7f3a"))
        #expect(alike.secrets.map(alike.named) == ["GitHub token (Production, github-token-2)", "GitHub token (Production, github-token)"])
        #expect(alike.giving == "Give GitHub token (Production, github-token-2), GitHub token (Production, github-token) to Staging deploy check once")

        // INF-3507's review: the phone names a secret as the computer's card does, so its foot and its own
        // confirmation agree with the title; a lone saved secret is named without its place.
        var computerNamed = use
        computerNamed["secrets"] = [
            ["ref": "calendar", "label": "Planning calendar", "version": 1, "environment": "Personal", "name": "Planning calendar"],
        ]
        home.waiting = [computerNamed]
        await secrets.read()
        let lone = try #require(secrets.use(card: "card-secrets-use-7f3a"))
        #expect(lone.secrets.map(lone.named) == ["Planning calendar"])
        #expect(lone.giving == "Give Planning calendar to Publish the staging build once")

        var unnamed = use
        unnamed["secrets"] = [["label": "GitHub token", "version": 3, "environment": "Production"]]
        home.waiting = [unnamed]
        await secrets.read()
        #expect(secrets.approvals == nil)
        #expect(secrets.use(card: "card-secrets-use-7f3a") == nil)
    }

    /// INF-6221, from a user's report that a permission card offered Allow once, Always allow this and Don't allow on
    /// the computer while the phone showed only Don't allow (INF-6220's reproduction). Every choice the computer's
    /// card carries stays on the phone: a fresh phone, which the home gives no challenge, keeps Allow once and says
    /// where to set up; Always allow this, and Allow for 10 minutes, stay drawn for the computer to save.
    /// The waiting use and the passes are as SecretsSettings raises a deploy script's use card for them.
    @Test func everyChoiceOnTheComputersCardStaysOnThePhone() async throws {
        func use(nonce: String?) -> [String: Any] { [
            "request": "36a7854d-5203-4c4f-ac9a-9d93b7ddcbab", "card": "card-secrets-use-36a7854d-5203-4c4f-ac9a-9d93b7ddcbab",
            "digest": "59187c63ce9b30f0afdc7a037d6a4912fda81514f6a03e883a25127c81ceed46", "expires": 301000,
            "nonce": nonce ?? NSNull(), "reason": "Deploy the website to staging and check it", "recipient": "/bin/sh",
            "task": "Deploy the site",
            "secrets": [["ref": "website-staging", "label": "Website deployment", "version": 1, "environment": "Staging",
                         "name": "Website deployment"]],
            "facts": [["name": "Program", "value": "/bin/sh · nothing you run can change it · fingerprint f338dc2ba973"]],
        ] }
        let passes = ["allow-once:5d1f0c9e-2b7a-4c55-9a43-0e6f2d8b1a77", "deny:9b3e7f12-61d4-4f0a-8c2e-3a5b7d9e0f14"]
        let always = "allow-always:c2a8e4f6-0b1d-4e3f-9a7c-5d6e8f0a1b23"
        let short = "allow-short:e7f9a1b3-4c5d-4e6f-8a9b-0c1d2e3f4a56"
        let card = "card-secrets-use-36a7854d-5203-4c4f-ac9a-9d93b7ddcbab"

        let fresh = Home()
        fresh.waiting = [use(nonce: nil)]
        let freshPhone = Self.secrets(fresh, ApprovalStorageTests.Keychain())
        await freshPhone.read()
        let freshUse = try #require(freshPhone.use(card: card))
        #expect((passes + [always, short]).map { freshPhone.choice($0, for: freshUse) }
            == [.setUpFirst, .deny, .onComputer, .onComputer])
        // A press on a choice made elsewhere says where, as the note above the choices and every computer-only choice do.
        #expect(PhoneSecrets.Choice.setUpFirst.notice(computer: "Mac mini") == PhoneMessages.phoneCardsApprovalTurnOn(computer: "Mac mini"))
        #expect(PhoneSecrets.Choice.onComputer.notice(computer: "Mac mini") == PhoneMessages.phoneCardsDoThisOn(computer: "Mac mini"))
        #expect(PhoneSecrets.Choice.deny.notice(computer: "Mac mini") == nil)

        let keychain = ApprovalStorageTests.Keychain()
        let kept = try ApprovalKey.create(on: .simulator, in: keychain)
        let enrolled = Home()
        enrolled.enrolled = (kept.device, kept.publicKey)
        enrolled.waiting = [use(nonce: "Wm9vbVZhbGlkTm9uY2VGb3JUZXN0")]
        let enrolledPhone = Self.secrets(enrolled, keychain)
        await enrolledPhone.read()
        let enrolledUse = try #require(enrolledPhone.use(card: card))
        #expect((passes + [always]).map { enrolledPhone.choice($0, for: enrolledUse) } == [.allow, .deny, .onComputer])
    }
}
