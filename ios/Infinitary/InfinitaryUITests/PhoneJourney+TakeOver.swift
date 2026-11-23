import XCTest

/// The take-over part (scripts/phone-test-plan.ts): its test and the steps only it takes.
extension PhoneJourney {
    /// INF-4207 piece 9 (decision 9): with the home out of reach, the computer's sheet lists the computer that keeps a
    /// copy with what Take over rests on there, and Take over, confirmed with Face ID, takes over there; the phone then
    /// follows the home at number 2 with no new code, and refuses number 1 coming back and a second home at number 2.
    /// Data: the test home's real record, copied to a computer that keeps a copy beside it (tests/helpers/phoneTakeOver.ts),
    /// whose link for phones, copy and takeover are the core's own. Completion: the phone is Live at number 2, then not
    /// Live after two attempts at each home it refuses.
    func testTakeOverFromThePhone() async throws {
        try await launchJoined()
        let started = try await home("standby-start")
        let standby = try XCTUnwrap(started["standby"] as? [String: Any])
        let id = try XCTUnwrap(standby["deviceId"] as? String)
        // The welcome's list reaches a phone already joined through the home's routes.
        _ = try await home("standby-home-stops")
        outOfReach()
        computerDetails()
        let row = app.otherElements["standby-\(id)"]
        XCTAssertTrue(row.waitForPresence(timeout: 20), app.debugDescription)
        // That computer's own words: when its copy is from, and that it lost the home too.
        XCTAssertTrue(row.staticTexts["It cannot reach Test Mac mini either."].waitForPresence(timeout: 20), app.debugDescription)
        let button = app.buttons["take-over-\(id)"]
        XCTAssertEqual(waitForPhonePredicate(NSPredicate(format: "enabled == true"), object: button, timeout: 20), .completed, app.debugDescription)
        // The sheet opens at half height with Take over below its edge: pulled up by its grabber, as a person does, the
        // whole row is in view. A swipe on the row itself starts below the sheet's edge whenever the row's middle is.
        let grabber = app.buttons["Sheet Grabber"].firstMatch
        for _ in 0..<3 where !app.frame.contains(button.frame) { grabber.swipeUp(); waitForSteadyTarget(row) }
        XCTAssertTrue(app.frame.contains(button.frame), app.debugDescription)
        // Both themes, for the change's pictures and its release note's hero picture.
        try await appearances("take-over-offer", showing: row.staticTexts["It cannot reach Test Mac mini either."])

        _ = try await home("biometry-enroll")
        tapOnPhone(button)
        let confirm = app.buttons["confirm-take-over"].firstMatch
        XCTAssertTrue(confirm.waitForPresence(timeout: 10), app.debugDescription)
        picture("take-over-confirm")
        tapOnPhone(confirm)
        // The system's own question the first time Face ID is used here.
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let permitted = springboard.alerts.buttons["OK"]
        if permitted.waitForPresence(timeout: 5) { tapOnPhone(permitted, repeatDiscarded: false) }
        _ = try await home("face-in-view")
        // The computer that took over answers at the home's own key with number 2, which the phone follows.
        reach("Live", timeout: 60)
        _ = try await home("face-away")
        let after = try await home("standby-state", method: "GET")
        XCTAssertEqual(after["homeNumber"] as? Int, 2, "\(after)")
        XCTAssertNotNil(after["takeOver"] as? String, "\(after)")
        if app.buttons["close-computer-details"].exists { tapOnPhone(app.buttons["close-computer-details"]) }
        XCTAssertTrue(cardHeading("Your phone is reading your Mac").waitForPresence(timeout: 10), app.debugDescription)
        picture("took-over-live")

        // The home the takeover left behind comes back with number 1, then a second home with number 2: each is
        // refused through two of the phone's own attempts, counted at the home, never by a clock. A second attempt
        // means the first connection ended; a refused home is never heard, so the words then leave Live.
        for command in ["standby-old-home", "standby-second-home"] {
            func attemptsSoFar() async throws -> Int {
                let state = try await home("state", method: "GET")
                return try XCTUnwrap(state["readings"] as? [String: Any])["homeAttempts"] as? Int ?? 0
            }
            let before = try await attemptsSoFar()
            _ = try await home(command)
            var attempts = before
            while attempts < before + 2 { attempts = try await attemptsSoFar() }
            XCTAssertEqual(waitForPhonePredicate(NSPredicate(format: "value != %@", "Live"), object: app.buttons["computer-details"],
                                                 timeout: 40), .completed, "\(command): the phone took a home it must refuse")
        }
        picture("refused-homes")
    }
}
