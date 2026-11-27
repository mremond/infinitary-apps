import XCTest

/// INF-82: a live, run-long log subscription can omit registrations after a relaunch.
/// Start a fresh observer before launch, so launch-time and attachment-time records are both covered.
@MainActor func launchPhoneApp(_ app: XCUIApplication) async throws {
    let control = try XCTUnwrap(ProcessInfo.processInfo.environment["PHONE_TEST_HOME"])
    var request = URLRequest(url: try XCTUnwrap(URL(string: control + "/keyboard-before-launch")))
    request.httpMethod = "POST"
    request.timeoutInterval = 40
    let (data, response) = try await phoneTestSession.data(for: request)
    guard (response as? HTTPURLResponse)?.statusCode == 200 else {
        throw NSError(domain: "PhoneKeyboard", code: 3, userInfo: [NSLocalizedDescriptionKey:
            "The app was not launched: " + (String(data: data, encoding: .utf8) ?? "No keyboard observer")])
    }
    let observer = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    let generation = try XCTUnwrap(observer["generation"] as? Int)
    XCTAssertGreaterThan(generation, 0)
    print("Keyboard observer started before launch: \(generation)")
    if !app.launchArguments.contains("-AppleLanguages") { app.launchArguments += englishPhone }
    app.launch()
}

/// The phone's languages (docs/i18n.md, "On the phone"): a journey finds the app's controls by their English words, so
/// every launch runs the app in English with US forms, whatever the simulator's own language and region. A launch in
/// another language names its own `-AppleLanguages` first.
let englishPhone = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]

/// INF-355: backboardd's registration of the chord for the current app process is the readiness witness.
/// UIKit publishes an app's key commands only while a hardware keyboard is attached when its deferred update
/// runs after the next Core Animation commit, and XCTest's own keyboard detaches within a millisecond of a key
/// press, so the test home attaches one to the owned simulator for this wait and detaches it afterwards.
/// No priming press, held modifier or delay: the requested chord is the only key event, sent once after the witness.
/// App-side keyCommands, elapsed time and repeated key presses are not readiness witnesses.
@MainActor func pressPhoneKey(_ key: String, modifiers: XCUIElement.KeyModifierFlags, in app: XCUIApplication) async throws {
    let control = try XCTUnwrap(ProcessInfo.processInfo.environment["PHONE_TEST_HOME"])
    var request = URLRequest(url: try XCTUnwrap(URL(string: control + "/keyboard-ready")))
    request.httpMethod = "POST"
    request.timeoutInterval = 40
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    let names: [(XCUIElement.KeyModifierFlags, String)] = [(.command, "cmd"), (.shift, "shft"), (.option, "opt"), (.control, "ctrl")]
    let specialKeys = [XCUIKeyboardKey.return.rawValue: "\r", XCUIKeyboardKey.tab.rawValue: "\t",
                       XCUIKeyboardKey.leftArrow.rawValue: "leftArrow", XCUIKeyboardKey.rightArrow.rawValue: "rightArrow",
                       XCUIKeyboardKey.upArrow.rawValue: "upArrow", XCUIKeyboardKey.downArrow.rawValue: "downArrow"]
    let canonicalKey = specialKeys[key] ?? key
    let modifierNames = names.filter { modifiers.contains($0.0) }.map { $0.1 }
    request.httpBody = try JSONSerialization.data(withJSONObject: [
        "key": canonicalKey, "modifiers": modifierNames
    ])
    try await phoneKeyboardReadiness(attach: {
        try await phoneKeyboardAttachment(true, control: control)
    }, wait: {
        PhoneWaitForKeyQuiescence(app)
    }, registration: {
        let (data, response) = try await phoneTestSession.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw NSError(domain: "PhoneKeyboard", code: 1, userInfo: [NSLocalizedDescriptionKey:
                "The requested chord was not sent: " + (String(data: data, encoding: .utf8) ?? "No keyboard registration witness")])
        }
        let witness = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        guard witness["key"] as? String == canonicalKey,
              witness["modifiers"] as? [String] == modifierNames,
              let pid = witness["pid"] as? Int, pid > 0,
              witness["token"] is String else {
            throw NSError(domain: "PhoneKeyboard", code: 2, userInfo: [NSLocalizedDescriptionKey:
                "The requested chord was not sent: its registration witness did not match"])
        }
        print("Keyboard registration acknowledged: \(witness)")
    }, detach: {
        try await phoneKeyboardAttachment(false, control: control)
    })
    // Xcode 26.4's typist generates no HID event for the Return constant (CR).
    // LF generates the actual Return key (usage page 7, code 0x28), routed as CR by backboardd.
    // Keep CR for the registration witness; send that physical key exactly once.
    try phoneKeyEvent(canonicalKey) {
        app.typeKey(canonicalKey == "\r" ? "\n" : canonicalKey == "\t" ? "\t" : key, modifierFlags: modifiers)
    }
}

@MainActor func phoneKeyboardReadiness(
    failures: PhoneFailures = .shared,
    attach: @MainActor () async throws -> Void, wait: () -> String?,
    registration: @MainActor () async throws -> Void, detach: @MainActor () async throws -> Void
) async throws {
    let result: Result<Void, Error>
    do {
        try await attach()
        try phoneKeyPhase("keyboard attachment", key: nil, failures: failures) { nil }
        try phoneKeyPhase("the fresh main-run-loop wait", key: nil, failures: failures, wait)
        try await registration()
        try phoneKeyPhase("keyboard registration", key: nil, failures: failures) { nil }
        result = .success(())
    } catch { result = .failure(error) }
    do { try await detach() }
    catch {
        if case .failure(let original) = result {
            throw NSError(domain: "PhoneKeyboard", code: 6, userInfo: [NSLocalizedDescriptionKey:
                "\(original.localizedDescription); keyboard detachment also failed: \(error.localizedDescription)"])
        }
        throw error
    }
    try result.get()
    try phoneKeyPhase("keyboard detachment", key: nil, failures: failures) { nil }
}

@MainActor private func phoneKeyboardAttachment(_ attached: Bool, control: String) async throws {
    let command = attached ? "keyboard-attach" : "keyboard-detach"
    var request = URLRequest(url: try XCTUnwrap(URL(string: control + "/" + command)))
    request.httpMethod = "POST"
    request.timeoutInterval = 40
    let (data, response) = try await phoneTestSession.data(for: request)
    guard (response as? HTTPURLResponse)?.statusCode == 200,
          let state = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          state["attached"] as? Bool == attached else {
        throw NSError(domain: "PhoneKeyboard", code: 7, userInfo: [NSLocalizedDescriptionKey:
            "The simulator did not confirm keyboard attachment state \(attached)"])
    }
}

/// Swift cannot catch the Objective-C exceptions XCTest raises while resolving an alert snapshot.
@MainActor func phoneKeyEvent(_ key: String, failures: PhoneFailures = .shared, _ send: () -> Void) throws {
    try phoneKeyPhase("key delivery", key: key, failures: failures) { PhoneCatchKeyException(send) }
}

@MainActor func phoneKeyPhase(
    _ phase: String, key: String?, failures: PhoneFailures = .shared, _ action: () -> String?
) throws {
    let checkpoint = failures.count
    // An earlier failure already makes XCTest's delivery state unusable; no later phase may send an event.
    let failure: String?
    if let earlier = failures.failure(since: 0) { failure = earlier }
    else {
        let exception = action()
        failure = failures.failure(since: checkpoint) ?? exception
    }
    if let failure {
        let message = key.map {
            "XCTest could not complete key \($0.debugDescription): \(failure). Delivery is unknown; no retry was made."
        } ?? "The requested chord was not sent: \(phase) failed: \(failure)"
        throw NSError(domain: "PhoneKeyboard", code: 4, userInfo: [NSLocalizedDescriptionKey: message])
    }
}

/// INF-6074: on a starved simulator the system's keyboard can take back the caret a key put in a text field. The
/// field's keyboard comes up, the keyboard arbiter's connection fails, and UIKit resigns the field, all while XCTest
/// waits for the app to go idle after the key. The test home reads those lines from the app's own log since `since`,
/// the runner's time before it asked for the key, on the simulator's clock in milliseconds; the proof is their lines
/// when they show it, and nil otherwise, so a caller recovers only on that proof and never presses the key twice.
@MainActor func phoneCaretTakenBack(since: Double) -> [String]? {
    do {
        let reply = try askPhoneHome("caret-outcome", since: since)
        _ = waitForPhonePredicate(NSPredicate { _, _ in reply.value != nil }, object: nil, timeout: 40)
        let outcome = try reply.answer()
        print("Caret outcome: \(outcome)")
        guard outcome["outcome"] as? String == "taken-back" else { return nil }
        return outcome["proof"] as? [String]
    } catch {
        XCTFail("The caret's outcome was not read: \(error)")
        return nil
    }
}

/// INF-1477 (the captain's choice "Allow a proven second tap"): XCTest gives each synthesized tap a virtual touch
/// screen of its own. A starved simulator's backboardd can attach that screen as an accessory, or as a bad usage pair,
/// and ignore its touches, and XCTest then confirms the tap after five seconds with no error. Every tap a phone journey
/// sends goes through here: the test home reads backboardd's own lines for it, and a second tap goes once, only when
/// they prove the first was ignored; delivered or unknown sends nothing more.
/// INF-1541 piece 1: each tap first waits for its target to hold still (waitForSteadyTarget), since XCTest no longer waits
/// for the app's animations. A crewmate in the scene orbits on the display clock and never holds still; its taps pass
/// `orbiting`, and revealCrew reads its frame against the scene's instead.
/// INF-1735's single-press regression passes repeatDiscarded: false: even a proven discarded tap fails, never repeats.
/// A tap at a point waits on the element the point is read against, or on `steady` when that element holds moving
/// drawings the tap does not touch, such as a window behind a sheet.
@MainActor func tapOnPhone(_ element: XCUIElement, orbiting: Bool = false, repeatDiscarded: Bool = true) {
    tapOnPhone("\(element)", steady: orbiting ? nil : element, repeatDiscarded: repeatDiscarded) { element.tap() }
}

@MainActor func tapOnPhone(_ point: XCUICoordinate, orbiting: Bool = false, steady: XCUIElement? = nil) {
    tapOnPhone("\(point)", steady: orbiting ? nil : steady ?? point.referencedElement) { point.tap() }
}

@MainActor private func tapOnPhone(_ target: String, steady: XCUIElement?, repeatDiscarded: Bool = true, _ tap: () -> Void) {
    var ignored: [String] = []
    for _ in 0..<2 {
        guard !PhoneFailures.recorded else { tap(); return }
        if let steady { waitForSteadyTarget(steady) }
        // The runner's and backboardd's records share the simulator's clock; the tap's touch screen attaches after this.
        let since = Date().timeIntervalSince1970 * 1000
        tap()
        guard !PhoneFailures.recorded, let outcome = phoneTouchOutcome(since: since) else { return }
        if outcome["outcome"] as? String != "delivered" { print("Touch outcome: \(outcome)") }
        guard outcome["outcome"] as? String == "discarded", let proof = outcome["proof"] as? String else { return }
        guard repeatDiscarded else {
            XCTFail("The simulator ignored the single tap on \(target): \(proof)")
            return
        }
        ignored.append(proof)
    }
    XCTFail("The simulator ignored both taps on \(target): \(ignored)")
}

/// INF-6231: a list's pull down past its top, to what waits above it such as Tasks' search, as a slow drag that keeps
/// touching for two seconds or more and rests before the lift. Every touch first waits on SpringBoard, which decides
/// whether it is a system gesture before the app's own gestures may act, and the list's pull counts only from then.
/// XCTest's plain swipe moves 200 points in a fifth of a second, so a late decision leaves the list almost none of it:
/// in phone run 45121433597 SpringBoard decided 0.18 s after the touch went down, the list began scrolling 10 ms before
/// the lift, and the search, which opens past 48 points of pull, stayed hidden. This drag moves 40% of the list's height
/// at 150 points a second, so it is still pulling long after SpringBoard decides, as INF-6073 opens a task row.
@MainActor func pullDownOnPhone(_ list: XCUIElement) {
    let from = list.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.45))
    let to = list.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.85))
    from.press(forDuration: 0.05, thenDragTo: to, withVelocity: XCUIGestureVelocity(rawValue: 150), thenHoldForDuration: 0.3)
}

/// INF-1477: a part runs with continueAfterFailure off, and once it has recorded a failure XCTest sends no more events:
/// every later tap checks for interrupting elements and synthesizes nothing, as the phone journeys' logs show after each
/// failure. No touch screen attaches, so a tap after a failure waits for no target and reads no outcome, which could only
/// reach its failure deadline: ten minutes, on a busy Mac, for each tap left in the part.
/// Only a failure counts: a warning, such as UIKit's runtime warning about a reparented view, fails nothing and XCTest
/// goes on sending events. Counting that warning turned off the target and outcome waits of every later tap in the part.
final class PhoneFailures: NSObject, XCTestObservation, @unchecked Sendable {
    static let shared = PhoneFailures()
    @MainActor private static var watching = false
    private let lock = NSLock()
    private var failures: [String] = []

    static var recorded: Bool { shared.count > 0 }
    var count: Int { lock.withLock { failures.count } }
    func failure(since checkpoint: Int) -> String? {
        lock.withLock { failures.dropFirst(checkpoint).first }
    }

    /// Before a part's first action (PhoneJourney.launchFresh); one observer serves every part in the process.
    @MainActor static func watch() {
        guard !watching else { return }
        XCTestObservationCenter.shared.addTestObserver(shared)
        watching = true
    }

    func testCaseWillStart(_ testCase: XCTestCase) {
        lock.withLock { failures.removeAll() }
    }

    func testCase(_ testCase: XCTestCase, didRecord issue: XCTIssue) {
        guard issue.isFailure else { return }
        lock.withLock { failures.append(issue.compactDescription) }
    }
}

/// A tap is synchronous, so its outcome request runs off the main actor while the run loop keeps servicing XCTest.
@MainActor private func phoneTouchOutcome(since: Double) -> [String: Any]? {
    do {
        let reply = try askPhoneHome("touch-outcome", since: since)
        _ = waitForPhonePredicate(NSPredicate { _, _ in reply.value != nil }, object: nil, timeout: 40)
        return try reply.answer()
    } catch {
        XCTFail("The tap's outcome was not read: \(error)")
        return nil
    }
}

/// Asks the test home what its simulator log showed for a tap the runner began at `since`, off the main actor;
/// the caller turns the run loop until `value` is set.
@MainActor func askPhoneHome(_ command: String, since: Double) throws -> PhoneHomeReply {
    let control = try XCTUnwrap(ProcessInfo.processInfo.environment["PHONE_TEST_HOME"])
    var request = URLRequest(url: try XCTUnwrap(URL(string: control + "/" + command)))
    request.httpMethod = "POST"
    request.timeoutInterval = 40
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONSerialization.data(withJSONObject: ["since": since])
    let prepared = request
    let reply = PhoneHomeReply()
    Task.detached {
        do {
            let (data, response) = try await phoneTestSession.data(for: prepared)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else {
                throw NSError(domain: "PhoneHome", code: 1, userInfo: [NSLocalizedDescriptionKey:
                    String(data: data, encoding: .utf8) ?? "No simulator log observer"])
            }
            reply.finish(.success(data))
        } catch {
            reply.finish(.failure(error))
        }
    }
    return reply
}

/// The detached request's answer, read on the main thread between run loop turns.
final class PhoneHomeReply: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: Result<Data, Error>?

    var value: Result<Data, Error>? { lock.withLock { stored } }

    func finish(_ answer: Result<Data, Error>) { lock.withLock { stored = answer } }

    func answer() throws -> [String: Any] {
        guard let value else { throw URLError(.timedOut) }
        return try XCTUnwrap(JSONSerialization.jsonObject(with: value.get()) as? [String: Any])
    }
}
