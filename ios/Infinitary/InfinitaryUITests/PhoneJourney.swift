import CoreImage
import XCTest

/// INF-64 piece 2's requested journey. Real TLS/core, disposable home and simulator; never a provider account.
/// Result: the same phone identity rejoins after launch, reads cards/feed, catches up and leaves/removes.
/// Prerequisites: iOS 18+ simulator, scripts/phone-test-home.ts; no camera, local network or signing material.
/// Each part (scripts/phone-test-plan.ts) has its own file, PhoneJourney+<Part>.swift, with its test and the steps only
/// it takes; this file holds the steps two or more parts share.
@MainActor final class PhoneJourney: XCTestCase {
    let app = XCUIApplication()
    var control: String { ProcessInfo.processInfo.environment["PHONE_TEST_HOME"]! }
    /// INF-1786: a display request waits for SpringBoard's own line, up to its 10-minute cap; a 60-second load budget
    /// ended it first. PHONE_DISPLAY_REQUEST_BUDGET_MS in tests/helpers/phoneKeyboard.ts mirrors it.
    let displayBudget: TimeInterval = 600

    func home(_ command: String, method: String = "POST", body: String? = nil, budget: TimeInterval = 60) async throws -> [String: Any] {
        var request = URLRequest(url: URL(string: control + "/" + command)!, timeoutInterval: budget)
        request.httpMethod = method
        request.httpBody = body.map { Data($0.utf8) }
        let (data, response) = try await phoneTestSession.data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200, String(data: data, encoding: .utf8) ?? "")
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    func picture(_ name: String) { picture(name, activeWindow: false) }

    func picture(_ name: String, activeWindow: Bool) {
        picture(name, screenshot: capturePicture(activeWindow: activeWindow))
    }

    // Use the app window for the open Duo: the runner's main-display capture returned black.
    private func capturePicture(activeWindow: Bool) -> XCUIScreenshot {
        activeWindow ? app.windows.firstMatch.screenshot() : XCUIScreen.main.screenshot()
    }

    private func picture(_ name: String, screenshot: XCUIScreenshot) {
        // Capture the display, not an app-window crop computed before an iPad rotation.
        let image = XCTAttachment(screenshot: screenshot)
        image.name = name; image.lifetime = .keepAlways; add(image)
    }

    /// INF-1537: a successful simulator command or an idle app is not a drawn appearance.
    /// These fixtures have broad light/dark surfaces, including the sheets. Observe every quadrant,
    /// so a dark card alone cannot pass for a dark screen, and retain the exact frame we observed.
    /// This is a fixture check, not a theme detector for arbitrary pictures or other apps.
    private func appearancePicture(_ name: String, dark: Bool, activeWindow: Bool = false) throws -> XCUIScreenshot {
        let context = CIContext()
        let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
        var observed: XCUIScreenshot?
        var last: XCUIScreenshot?
        var settled = false
        var brightness: [Double] = []
        let result = waitForPhonePredicate(NSPredicate { _, _ in
            let screenshot = self.capturePicture(activeWindow: activeWindow)
            last = screenshot
            guard self.app.state == .runningForeground, let pixels = screenshot.image.cgImage else { return false }
            let image = CIImage(cgImage: pixels)
            let halfWidth = image.extent.width / 2, halfHeight = image.extent.height / 2
            brightness = []
            for y in [0.0, halfHeight] {
                for x in [0.0, halfWidth] {
                    let bounds = CGRect(x: x, y: y, width: halfWidth, height: halfHeight)
                    let average = image.applyingFilter("CIAreaAverage", parameters: [kCIInputExtentKey: CIVector(cgRect: bounds)])
                    var rgba = [UInt8](repeating: 0, count: 4)
                    context.render(average, toBitmap: &rgba, rowBytes: 4, bounds: CGRect(x: 0, y: 0, width: 1, height: 1),
                                   format: .RGBA8, colorSpace: colorSpace)
                    brightness.append(rgba.prefix(3).reduce(0.0) { $0 + Double($1) } / (3 * Double(UInt8.max)))
                }
            }
            // The midpoint separates these fixtures' near-white and near-black surfaces, not a pixel golden.
            guard brightness.allSatisfy({ dark ? $0 < 0.5 : $0 > 0.5 }),
                  !activeWindow || brightness.contains(where: { $0 > 0 }) else { return false }
            // Only now is the requested appearance actually drawing. The screen inside the caller's still element has
            // settled (waitForRedraw), and XCTest no longer waits out animations, so observe again; the first dark frame
            // can lack chrome.
            if !settled {
                settled = true
                self.app.activate()
                return false
            }
            observed = screenshot
            return true
        }, object: nil, timeout: 10)
        print("Appearance picture \(name): expected \(dark ? "dark" : "light"), quadrant brightness \(brightness), result \(result)")
        if result != .completed, let last { picture(name + "-unconfirmed", screenshot: last) }
        return try XCTUnwrap(observed, "The app never drew \(dark ? "dark" : "light") for \(name); quadrant brightness \(brightness)")
    }

    /// INF-1541 piece 1: XCTest no longer waits out the display's change, so each picture waits until `shown`, a part
    /// of the screen that holds still, draws differently than it did before the change, and settles; INF-1537 then
    /// confirms the whole screen draws the requested appearance before the picture is kept. Its first match is read,
    /// since a line such as Activity's can repeat.
    func appearances(_ name: String, showing element: XCUIElement, activeWindow: Bool = false) async throws {
        let shown = element.firstMatch
        let window = activeWindow ? app.windows.firstMatch : nil
        let light = waitForRedraw(shown, from: nil, window: window)
        picture(name, screenshot: try appearancePicture(name, dark: false, activeWindow: activeWindow))
        _ = try await home("display-dark", budget: displayBudget)
        app.activate()
        let dark = waitForRedraw(shown, from: light, window: window)
        picture(name + "-dark", screenshot: try appearancePicture(name + "-dark", dark: true, activeWindow: activeWindow))
        _ = try await home("display-light", budget: displayBudget)
        app.activate()
        _ = waitForRedraw(shown, from: dark, window: window)
        _ = try appearancePicture(name + "-restored", dark: false, activeWindow: activeWindow)
    }

    /// The whole screen draws `dark` or light without a change of the simulator's own appearance, as when the app's
    /// own Theme overrides it; the drawn frame is kept as `name`.
    func drawn(_ name: String, dark: Bool) throws {
        picture(name, screenshot: try appearancePicture(name, dark: dark))
    }

    func computerDetails() {
        let details = app.buttons["computer-details"]
        XCTAssertTrue(details.waitForPresence(timeout: 10))
        XCTAssertEqual(details.label, "Your computer")
        tapOnPhone(details)
        XCTAssertTrue(app.buttons["close-computer-details"].waitForPresence(timeout: 10))
    }

    func tab(_ name: String, repeatDiscarded: Bool = true) {
        // INF-1062: the tabs are words in the top bar's strip, the same on iPhone and an upright iPad; the pressed one lights.
        let tab = app.buttons["tab-" + name.lowercased()]
        XCTAssertTrue(tab.waitForPresence(timeout: 10), app.debugDescription); tapOnPhone(tab, repeatDiscarded: repeatDiscarded)
        XCTAssertEqual(waitForPhonePredicate(NSPredicate(format: "selected == true"), object: tab, timeout: 10), .completed, "\(name) is the lit tab after its press")
    }

    /// INF-1062: in reach the bar says nothing; the computer button's value carries the reach for VoiceOver,
    /// and a line under the bar says it only while the computer is not in reach.
    /// INF-2668: the line says Out of reach once the computer has been quiet for the captain's 20 s, counted from the
    /// last thing it sent, which a ping every 10 s keeps at most that old; a gone computer is named within 31 s.
    func outOfReach(_ message: @autoclosure () -> String = "") {
        XCTAssertTrue(app.staticTexts["Out of reach"].waitForPresence(timeout: 35), message())
    }

    /// INF-4326 (INF-4241's speed-ups): a step that needs only the computer gone, not the Out of reach words, waits for
    /// `shown`, a control the lost connection changes at once, such as a button it disables; `outOfReach` waits out the
    /// captain's 20 s first, which only the steps that read those words need.
    func offline(_ shown: XCUIElement, enabled: Bool = false, _ message: @autoclosure () -> String = "") {
        XCTAssertEqual(waitForPhonePredicate(NSPredicate(format: "exists == true AND enabled == %@", NSNumber(value: enabled)), object: shown, timeout: 10),
                       .completed, message())
    }

    func reach(_ words: String, timeout: TimeInterval = 20) {
        let button = app.buttons["computer-details"]
        // Reading an absent button's value fails at once, so a join still under way is waited for first.
        XCTAssertTrue(button.waitForPresence(timeout: timeout), app.debugDescription)
        XCTAssertEqual(waitForPhonePredicate(NSPredicate(format: "value == %@", words), object: button, timeout: timeout), .completed, app.debugDescription)
        if words == "Live" { XCTAssertFalse(app.otherElements["reach-line"].exists, "Live, no line under the bar repeats it") }
    }

    /// Away past the app's background time (`INFINITARY_TEST_BACKGROUND_TIME`): the app closes its connection when it ends.
    func background() async throws {
        XCUIDevice.shared.press(.home)
        // The home waits up to a minute for the phone to go; its answer must not be cut first.
        _ = try await home("disconnected", budget: 90)
    }

    /// Proposes a join link from the home. INF-4326 (INF-4241's speed-ups): typing a 200-character link took about 6.5 s
    /// a join, 33 times a run, so only `typed` joins go through the paste field (the join-read part's, which pictures it);
    /// every other join opens the link, as a tapped link does, and reaches the same confirmation. The system opens it
    /// into the running app; `XCUIApplication.open` would force-quit the app and launch it again without its test setup.
    func submitLink(_ command: String = "link", typed: Bool = false) async throws {
        let invitation = try await home(command)
        let link = try XCTUnwrap(invitation["link"] as? String)
        if typed {
            tapOnPhone(app.buttons["paste-link"])
            let field = app.textFields["join-link"]
            // A fresh iOS keyboard presents its own typing guide before accepting other taps; the focus owner waits it out.
            focusForPhoneTyping(field, in: app)
            field.typeText(link)
            // INF-1312: Paste and Continue share one row; pictured once, on the first link.
            if command == "wrong-link" { picture("paste-link") }
            tapOnPhone(app.buttons["read-link"])
        } else {
            XCUIDevice.shared.system.open(try XCTUnwrap(URL(string: link)))
        }
        // iOS 26 exposes a dialog's native button and its SwiftUI label as nested buttons.
        let confirm = app.buttons["confirm-join"].firstMatch
        XCTAssertTrue(confirm.waitForPresence(timeout: 10))
        // INF-589 item 4: the cancel choice stays in view beside Join, where a popover would hide it.
        waitUntilHittable(app.alerts.buttons["Cancel"].firstMatch)
        tapOnPhone(confirm)
    }

    func join(typed: Bool = false) async throws {
        try await submitLink(typed: typed)
        reach("Live", timeout: 20)
    }

    // INF-662 piece 2 (the captain's "Both at once, journey in parts"): the journey's parts are tests, each run from
    // its own fresh home and a clean app (scripts/phone-test-plan.ts). INF-2125 direction C (the captain's "Shared fixes,
    // then short parts", so each pull request's phone check finishes quickly): the join, cards, talk and relaunch parts
    // are each split into shorter tests. Every check the single journey made stays, in the test it belongs to; each test
    // first reaches, from its own fresh home, the state its checks read.
    func launchFresh() async throws {
        continueAfterFailure = false
        PhoneFailures.watch()
        // INF-1541 piece 1: before the first action, so no wait in the part asks for the app's animation reply.
        try skipPhoneAnimationWait()
        app.launchEnvironment["INFINITARY_ISOLATED_PHONE_TEST"] = "1"
        // INF-1528: the simulator never ends the app's background time, so the app ends it after this long.
        // INF-4326 (INF-4241's speed-ups): 10 s, down from 15, still holds join-away's short trip (home, one change,
        // reopen: a few seconds) whole, and every longer trip waits it out, six a run.
        app.launchEnvironment["INFINITARY_TEST_BACKGROUND_TIME"] = "10"
        XCUIDevice.shared.orientation = .portrait
        try await launchPhoneApp(app)
        XCTAssertTrue(app.buttons["paste-link"].waitForPresence(timeout: 10), app.debugDescription)
    }

    func launchJoined() async throws {
        try await launchFresh()
        try await join()
        XCTAssertTrue(cardHeading("Your phone is reading your Mac").waitForPresence(timeout: 10), app.debugDescription)
    }

    /// INF-2568's KeyboardViewportProbe, for the captain's report: "both the main chat input and a card's reply input don't
    /// always stay in viewport when ios keyboard is up. that makes typing very difficult". With the keyboard up on one
    /// field, it records each way that field is not wholly between the top bar's foot and the keyboard's drawn top: a
    /// card's scroller clipping it, the message box or the pager covering it, or the message box itself behind the
    /// keyboard. Every situation is checked before the test fails, so one run reports each one that leaves the room.
    /// Platform: the gate's pinned simulators (scripts/phone-pin.json), whose keyboard INF-2568 measured.
    func keyboardViewportProbe(_ situation: String, _ field: XCUIElement, into failures: inout [String]) {
        let keyboard = app.keyboards.firstMatch
        XCTAssertTrue(keyboard.waitForPresence(timeout: 10), "\(situation): no keyboard")
        XCTAssertEqual(waitForPhonePredicate(NSPredicate(format: "hasKeyboardFocus == true"), object: field, timeout: 10),
                       .completed, "\(situation): the field lost the keyboard's focus")
        let identifier = field.identifier
        // The keyboard and the layout animate in: read once the keyboard, the field and the message box each hold still.
        // INF-4326 (INF-4241's speed-ups): each look reads the field and the screen once, and every check below answers
        // from the last, steady look rather than reading each element again.
        var steady = PhoneSteadyReading<[CGRect]>()
        var look: (field: CGRect, screen: PhoneScreen)?
        let still = NSPredicate { _, _ in
            guard let f = (try? field.snapshot())?.frame, let screen = PhoneScreen(self.app), let keys = screen.first(.keyboard) else {
                return steady.read(nil)
            }
            look = (f, screen)
            return steady.read([keys.frame, f, screen.first("phone-composer")?.frame ?? .null])
        }
        XCTAssertEqual(waitForPhonePredicate(still, object: nil, timeout: 10), .completed, "\(situation): the keyboard and the field never held still")
        guard let look, let keys = look.screen.first(.keyboard) else {
            failures.append("KEYBOARD VIEWPORT \(situation): the keyboard or the field was never read"); return
        }
        let f = look.field, screen = look.screen
        let any = { (id: String) in screen.first(id) }
        let composer = any("phone-composer")
        // XCUITest's keyboard frame leaves out the suggestion row drawn above the keys. INF-2568's screenshots on the pinned
        // iOS 27.0 simulators put the drawn top 44 pt above that frame on the iPhone 16 and 55 pt above it on the iPad Pro
        // 11-inch (M4), upright and on its side.
        let suggestionRow: CGFloat = UIDevice.current.userInterfaceIdiom == .pad ? 55 : 44
        let keyTop = keys.frame.minY - suggestionRow
        let barFoot = screen.first(.navigationBar)?.frame.maxY ?? screen.first(.window)?.frame.minY ?? 0
        var problems: [String] = []
        // INF-3746: a note's comment is a card text box too, under the same keyboard rules as the card's reply.
        let inCard = ["card-reply", "note-comment"].contains(identifier)
        if f.maxY > keyTop + 0.5 { problems.append(String(format: "its foot is %.0f pt behind the keyboard", f.maxY - keyTop)) }
        if f.minY < barFoot - 0.5 { problems.append(String(format: "its top is %.0f pt above the bar's foot", barFoot - f.minY)) }
        if inCard {
            // A reply inside the scroller of a card whose whole frame scrolls is clipped at the scroller's foot.
            let scroll = screen.first("card-scroll", .scrollView)
            if let scroll, any("card-frame") == nil, any("card-back") == nil, f.maxY > scroll.frame.maxY + 0.5 {
                problems.append(String(format: "its foot is %.0f pt past the card's lower edge", f.maxY - scroll.frame.maxY))
            }
            // A note's comment under its part sits inside the scroller of a pinned card too, which clips it at its foot; in
            // the foot of a card on an iPhone on its side it starts below that scroller.
            if identifier == "note-comment", let scroll, f.minY < scroll.frame.maxY - 0.5, f.maxY > scroll.frame.maxY + 0.5 {
                problems.append(String(format: "its foot is %.0f pt past the card's scroller", f.maxY - scroll.frame.maxY))
            }
            for cover in [composer, any("card-pager")].compactMap({ $0 }) where cover.frame.intersects(f) {
                problems.append("\(cover.identifier) covers it at \(cover.frame)")
            }
        }
        // INF-3468, the captain: "hide pager and everything below the card (the main chat input etc) to make more space".
        // On an iPhone or an iPad, upright or on its side, while a card's reply holds the keyboard the message box steps
        // aside, undrawn and under its own name, and the pager leaves; while the message box holds it, it stays in view.
        let aside = any("phone-composer-aside") != nil
        if inCard {
            if !aside { problems.append("the message box stayed in view") }
            if any("card-pager") != nil { problems.append("the pager stayed in view") }
            if identifier == "card-reply" { cardReplyRoom(f, keyTop: keyTop, in: screen, into: &problems) }
        } else if aside {
            problems.append("the message box stepped aside")
        }
        // The captain named both fields: whichever one holds the keyboard, the message box stays above it too.
        if let composer, composer.frame.maxY > keyTop + 0.5 {
            problems.append(String(format: "the message box is %.0f pt behind the keyboard", composer.frame.maxY - keyTop))
        }
        let frame = { (id: String) in any(id).map { "\($0.frame)" } ?? "absent" }
        let line = "KEYBOARD VIEWPORT \(situation): field \(f) keyboard \(keys.frame) drawn-top \(keyTop) bar-foot \(barFoot)"
            + " card-frame \(frame("card-frame")) card-scroll \(frame("card-scroll")) card-back \(frame("card-back"))"
            + " pager \(frame("card-pager")) composer \(aside ? "aside" : frame("phone-composer")) -> "
            + (problems.isEmpty ? "in view" : problems.joined(separator: "; "))
        print(line)
        picture("keyboard " + situation)
        if !problems.isEmpty { failures.append(line) }
    }

    /// INF-3468, the captain: "have a little margin between the focused textbox and the bottom edge of the card", and the
    /// captain's pick of where a card's reply comes to rest: with the card's choices showing under it where they fit,
    /// otherwise with 16 points, the box's inset from the card's sides, between it and the card's visible foot. Where the
    /// card shows less room than the box and that margin, as on an iPhone on its side, the caret's line is the rule
    /// (the field's foot above the keyboard, checked by the caller).
    func cardReplyRoom(_ f: CGRect, keyTop: CGFloat, in screen: PhoneScreen, into problems: inout [String]) {
        let card = screen.first("card-back") ?? screen.first("card-frame") ?? screen.first("card-scroll", .scrollView)
        guard let card else { problems.append("no card around the reply"); return }
        let barFoot = screen.first(.navigationBar)?.frame.maxY ?? screen.first(.window)?.frame.minY ?? 0
        let top = max(card.frame.minY, barFoot)
        let foot = min(card.frame.maxY, keyTop)
        let margin: CGFloat = 16
        // The box a person sees is the reply's whole rounded field: its words, which XCUITest frames without the field's
        // padding, and the send circle at its foot.
        let box = screen.first("send-reply", .button).map { f.union($0.frame) } ?? f
        guard box.height + margin <= foot - top else { return }
        let choices = screen.all(.button) { $0.identifier.hasPrefix("card-action-") || $0.identifier == "note-done" }
        let under = choices.contains { $0.frame.minY >= box.maxY - 0.5 && $0.frame.maxY <= foot + 0.5 && $0.frame.height > 0 }
        if !under && box.maxY > foot - margin + 0.5 {
            problems.append(String(format: "no choice shows under it and its foot is %.0f pt above the card's visible foot, under the %.0f pt margin",
                                   foot - box.maxY, margin))
        }
    }

    /// Fails the test with every situation the keyboard checks recorded.
    func finishKeyboardChecks(_ failures: [String]) {
        if !failures.isEmpty { XCTFail("\(failures.count) keyboard situations failed:\n" + failures.joined(separator: "\n")) }
    }

    /// The field reads as a text field or, once it holds lines, a text view.
    func keyboardInput(_ id: String) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "identifier == %@ AND (elementType == %d OR elementType == %d)",
            id, XCUIElement.ElementType.textField.rawValue, XCUIElement.ElementType.textView.rawValue)).firstMatch
    }

    /// Turns the device and waits until the bar's computer button has moved with it and holds still.
    func turnForProbe(_ orientation: UIDeviceOrientation) {
        turnPhone(to: orientation, in: app, moving: app.buttons["computer-details"])
    }

    func dismissKeyboardForProbe() async throws {
        let done = app.navigationBars.buttons["dismiss-phone-keyboard"]
        XCTAssertTrue(done.waitForPresence(timeout: 10), app.debugDescription)
        tapOnPhone(done)
        XCTAssertTrue(app.keyboards.firstMatch.waitForAbsence(timeout: 10), app.debugDescription)
    }

    /// The whole merge card scrolls, so its reply may start below the stage's foot: swipe the card until it can be pressed.
    func revealForProbe(_ element: XCUIElement, in scroll: XCUIElement) {
        for _ in 0..<6 where !element.isHittable { scroll.swipeUp(); waitForSteadyTarget(scroll) }
        XCTAssertTrue(waitForPhonePress(element), "\(element) never came into view: \(app.debugDescription)")
    }

    /// Data shared by the talk, tasks and relaunch tests: the hero card on the stage after a relaunch, the on-request
    /// harbour task and a sent captain ask, so each launch restores a last turn. Answers the talk fixture.
    func launchWithLastTurn() async throws -> [String: Any] {
        try await launchJoined()
        _ = try await home("empty-cards")
        let hero = try await home("hero-card")
        XCTAssertTrue(cardHeading(try XCTUnwrap(hero["title"] as? String)).waitForPresence(timeout: 10), app.debugDescription)
        let fixture = try await home("talk-fixture")
        let input = app.textFields["message-box"]
        focusForPhoneTyping(input, in: app); input.typeText(try XCTUnwrap(fixture["text"] as? String))
        tapOnPhone(app.buttons["send-message"])
        let sent = try await home("talk-sent")
        XCTAssertEqual((sent["lastTurn"] as? [String: Any])?["you"] as? String, fixture["text"] as? String)
        XCTAssertTrue(app.staticTexts["last-turn-you"].waitForPresence(timeout: 10))
        return fixture
    }

    /// INF-1735: reach and the restored last turn can precede the requested appearance's drawn chrome.
    /// Use the same observed-appearance owner as appearances(), not a raw hero screenshot followed by a press.
    /// Each round is a fresh dark/light relaunch pair with exactly one Tasks press; a miss fails immediately.
    /// Tasks stays shown after the last round. `pictured` keeps the first round's hero pictures. INF-4241 removed
    /// INF-1735's twenty-pair soak; talk-tasks runs the one pair that guards the fix.
    func relaunchPairs(_ rounds: Int, pictured: Bool = false) async throws {
        for round in 1...rounds {
            print("INF-1735 relaunch pair \(round)")
            for (command, dark) in [("appearance-dark", true), ("appearance-light", false)] {
                _ = try await home(command, budget: displayBudget)
                app.terminate(); try await launchPhoneApp(app)
                reach("Live", timeout: 20)
                XCTAssertTrue(app.staticTexts["last-turn-you"].waitForPresence(timeout: 10))
                let name = dark ? "talk-hero-dark" : "talk-hero-light"
                let screenshot = try appearancePicture(name, dark: dark)
                if pictured && round == 1 { picture(name, screenshot: screenshot) }
            }
            tab("Tasks", repeatDiscarded: false)
            XCTAssertTrue(app.buttons["group-backlog"].waitForPresence(timeout: 10), "Tasks shows its list after relaunch pair \(round)")
            if round < rounds { tab("Home", repeatDiscarded: false) }
        }
    }

    /// INF-64 piece 4: a phone answers at the real home, not a local stand-in; opaque scripts cannot gain native effects.
    /// The cards part owns its simulator/home, no shared account or signed build.
    func cardHeading(_ title: String) -> XCUIElement {
        // INF-64 piece 4: departure means leaving the stage, not erasing INF-82's foreground notice.
        app.staticTexts.matching(identifier: "card-title").matching(NSPredicate(format: "label == %@", title)).firstMatch
    }

    func showCard(_ title: String) {
        if app.staticTexts["card-title"].label == title { return }
        // INF-1651: a pick made while the shown card finishes drawing is lost with the menu still open, so the pager
        // opens once the shown body is revealed: until then it is one closed element with nothing inside.
        waitForShownBodyRevealed()
        // The count opens its menu as a popup; find it by its own stable identity rather than by an element type.
        let pager = app.descendants(matching: .any).matching(identifier: "card-pager").firstMatch
        XCTAssertTrue(pager.waitForPresence(timeout: 10), app.debugDescription); tapOnPhone(pager)
        let item = app.buttons[title].firstMatch
        XCTAssertTrue(item.waitForPresence(timeout: 10), app.debugDescription); tapOnPhone(item)
        XCTAssertTrue(cardHeading(title).waitForPresence(timeout: 10))
    }

    /// INF-1651: the shown card's body, once present, opens as one closed element; it is revealed once something inside shows.
    func waitForShownBodyRevealed() {
        let body = app.webViews.matching(identifier: "card-body").firstMatch
        if body.exists {
            let revealed = NSPredicate { _, _ in body.descendants(matching: .any).firstMatch.exists }
            XCTAssertEqual(waitForPhonePredicate(revealed, object: nil, timeout: 10), .completed, "The shown card body was never revealed")
        }
    }

    func reveal(_ element: XCUIElement) {
        let scroll = app.scrollViews["card-scroll"]
        let body = app.webViews.matching(identifier: "card-body").firstMatch
        // INF-3468: a drag that moved the element is progress, not a try, so a long card is read down to its element however
        // far the card starts from it; the card's scroll ends, so the drags do too. A try is a drag that moved nothing, or a swipe.
        var tries = 0
        while tries < 8 {
            // INF-1651: after the card moves, iOS 27.0 reports a body element's frame one layout behind, partly outside
            // the body, until the card scrolls. A control's own frame can overhang the body by a point.
            let stale = body.exists && body.frame.intersects(element.frame)
                && !body.frame.insetBy(dx: -2, dy: -2).contains(element.frame)
            // A body element reads hittable even where the card's scroller clips it, as under the pinned footer, whose reply
            // field a press there focused on iPhone. So a body element is first moved inside the scroller.
            // INF-4607: the scroller runs under the top bar, which takes a press there, so only the part below the bar's foot
            // counts. On an iPhone on its side the drags could leave a paragraph's middle under the bar, and its tap missed.
            // The element comes wholly inside, with no allowance past either edge: a text box left under a point past the
            // foot showed its border clipped there and failed the body field's check, which allows half a point. The card's
            // content keeps padding under its body, so a box at the body's foot can always come wholly inside.
            let view = scroll.exists ? phoneCardReadingBounds(scroll, app: app) : .null
            if !view.isNull, element.exists, !stale, body.exists, body.frame.insetBy(dx: -2, dy: -2).contains(element.frame),
               element.frame.height < view.height,
               element.frame.minY < view.minY || element.frame.maxY > view.maxY {
                let dy = max(-view.height * 0.4, min(view.height * 0.4, view.midY - element.frame.midY))
                // The drag starts in the middle of what shows, never on the bar.
                let start = scroll.coordinate(withNormalizedOffset: .zero)
                    .withOffset(CGVector(dx: view.midX - scroll.frame.minX, dy: view.midY - scroll.frame.minY))
                let before = element.frame.midY
                start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 0, dy: dy)), withVelocity: .slow, thenHoldForDuration: 0.3)
                if !element.exists || abs(element.frame.midY - before) < 1 { tries += 1 }
                continue
            }
            tries += 1
            if element.isHittable && !stale { return }
            // Use the card's actual viewport: a whole-screen swipe hits the keyboard while replying.
            if stale || (element.exists && !view.isNull && element.frame.maxY < view.minY) { scroll.swipeDown() }
            else { scroll.swipeUp() }
        }
        XCTAssertTrue(element.isHittable, app.debugDescription)
    }

    func waitUntilEnabled(_ element: XCUIElement) {
        XCTAssertEqual(waitForPhonePredicate(NSPredicate(format: "enabled == true"), object: element, timeout: 10), .completed, app.debugDescription)
    }

    /// INF-1541 piece 1: XCTest no longer waits out a dialog's entrance, so its button is read once it takes a touch.
    func waitUntilHittable(_ element: XCUIElement) {
        XCTAssertTrue(waitForPhonePress(element), app.debugDescription)
    }
    /// INF-1109's phone approvals (docs/secrets.md, "Remote decisions"), built by INF-1202. Result: this phone offers its
    /// own approval key from Settings, the computer's card shows the same code and only a click there enrolls it, one
    /// Allow here, confirmed by Face ID, runs exactly the use waiting on the computer, and Deny needs no key. Before it
    /// is set up, the phone keeps every choice the computer's card carries and says where each allow is made. Data: the
    /// real Secrets controller over disposable custody and an invented calendar token; the computer's own confirmation
    /// and the calendar are the test home's stand-ins. Completion: the computer's Secrets history reads each use's end.
    /// Prerequisites: the owned simulator's Face ID, which the test home enrolls. It runs alone or in the rest part,
    /// installs its own native wait and failure hooks, and joins only when the phone has not.
    func testSecretsApprovals() async throws {
        continueAfterFailure = false
        // INF-1109 / INF-2092: this test must run alone, without launchFresh installing its prerequisites first.
        PhoneFailures.watch()
        try skipPhoneAnimationWait()
        app.launchEnvironment["INFINITARY_ISOLATED_PHONE_TEST"] = "1"
        XCUIDevice.shared.orientation = .portrait
        try await launchPhoneApp(app)
        let start = app.buttons.matching(NSPredicate(format: "identifier IN %@", ["paste-link", "computer-details"])).firstMatch
        XCTAssertTrue(start.waitForPresence(timeout: 10), app.debugDescription)
        if app.buttons["paste-link"].exists { try await join() } else { reach("Live", timeout: 20) }
        _ = try await home("empty-cards")
        _ = try await home("biometry-enroll")
        let ready = try await home("secrets-ready")
        XCTAssertEqual(ready["availability"] as? String, "available")
        let confirmWords = try XCTUnwrap(ready["confirm"] as? String)

        // INF-1109: after the old sheet disappears, UIKit can still ignore a press on the Settings control.
        // The touch owner waits for the drawn target and records delivery, without repeating the press.
        func openSettings() {
            let settings = app.buttons["phone-settings"]
            tapOnPhone(settings, repeatDiscarded: false)
            // The accepted Settings section plan keeps the same approvals under Devices → This phone.
            let devices = app.buttons["phone-settings-devices"]
            XCTAssertTrue(devices.waitForPresence(timeout: 10), app.debugDescription)
            tapOnPhone(devices, repeatDiscarded: false)
        }

        // INF-1109: an enrolled label can appear before Settings finishes entering, while UIKit still ignores
        // interaction. Every close waits for its own drawn target, sends one press and keeps the absence check.
        func closeSettings() {
            let close = app.buttons["close-phone-settings"]
            tapOnPhone(close, repeatDiscarded: false)
            XCTAssertTrue(close.waitForAbsence(timeout: 10))
        }

        // INF-6221: a phone not set up keeps every choice the computer's card carries. Allow once says where to set
        // up and the computer's short allowance says to do it on the computer; neither sends anything, and Don't allow
        // still refuses here.
        let unset = try await home("secrets-request")
        let unsetTitle = try XCTUnwrap(unset["title"] as? String)
        showCard(unsetTitle)
        func passed(_ answer: String) -> XCUIElement {
            app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "card-action-\(answer):")).firstMatch
        }
        let allowHere = passed("allow-once"), allowOnComputer = passed("allow-short"), denyHere = app.buttons["approval-deny"]
        XCTAssertTrue(denyHere.waitForPresence(timeout: 20), app.debugDescription)
        XCTAssertTrue(allowHere.exists && allowOnComputer.exists, app.debugDescription)
        XCTAssertEqual(allowHere.label, "Allow once")
        XCTAssertEqual(allowOnComputer.label, "Allow for 10 minutes")
        XCTAssertFalse(app.buttons["approval-allow"].exists, "Allow once here needs this phone's key first")
        waitUntilEnabled(allowHere)
        try await appearances("secrets-use-not-set-up", showing: allowHere)
        reveal(allowHere); tapOnPhone(allowHere, repeatDiscarded: false)
        XCTAssertTrue(app.staticTexts["To allow here, turn on Approves secret uses in Settings. You can also allow on Test Mac mini."]
            .waitForPresence(timeout: 10), app.debugDescription)
        reveal(allowOnComputer); tapOnPhone(allowOnComputer, repeatDiscarded: false)
        XCTAssertTrue(app.staticTexts["Do this on Test Mac mini."].waitForPresence(timeout: 10), app.debugDescription)
        picture("secrets-use-not-set-up-pressed")
        let untouched = try await home("secrets-state", method: "GET")
        XCTAssertEqual((untouched["uses"] as? [[String: Any]])?.first { $0["request"] as? String == unset["request"] as? String }?["state"] as? String,
            "waiting", "Neither press decides the use")
        reveal(denyHere); tapOnPhone(denyHere, repeatDiscarded: false)
        XCTAssertTrue(cardHeading(unsetTitle).waitForAbsence(timeout: 20), app.debugDescription)

        // Settings offers this phone's key when its Approves secret uses switch is turned on (INF-1690 piece 4); the
        // computer raises its card with the code this phone shows.
        openSettings()
        let setUp = app.switches["approval-switch"]
        XCTAssertTrue(setUp.waitForPresence(timeout: 20), app.debugDescription)
        XCTAssertEqual(setUp.value as? String, "0", "The switch starts off")
        // INF-1109: UIKit dropped the setup press while Settings was still sliding in, so it is pressed once Settings
        // holds still. The touch owner records delivery but is forbidden to repeat this press.
        waitForSteadyTarget(setUp)
        picture("secrets-settings")
        tapOnPhone(setUp, repeatDiscarded: false)
        let code = app.staticTexts["approval-code"]
        XCTAssertTrue(code.waitForPresence(timeout: 20), app.debugDescription)
        let shown = code.label.replacingOccurrences(of: "Code ", with: "")
        XCTAssertNotNil(shown.range(of: #"^\d{4} \d{4}$"#, options: .regularExpression), shown)
        picture("secrets-settings-code")
        closeSettings()

        // The enrollment is the computer's to confirm: on this phone its Confirm only says so, and nothing changes.
        let offered = try await home("secrets-state", method: "GET")
        let enrollment = try XCTUnwrap((offered["cards"] as? [[String: Any]])?.first?["title"] as? String)
        XCTAssertTrue(enrollment.contains(UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone"), enrollment)
        showCard(enrollment)
        let confirmHere = app.buttons.matching(NSPredicate(format: "label == %@", confirmWords)).firstMatch
        XCTAssertTrue(confirmHere.waitForPresence(timeout: 10), app.debugDescription)
        // Like every card's choices (INF-1083), Confirm takes a press only once the body reports drawn; a press
        // before then is refused and the phone never says where to confirm.
        waitUntilEnabled(confirmHere)
        picture("secrets-enrollment-card")
        reveal(confirmHere); tapOnPhone(confirmHere, repeatDiscarded: false)
        XCTAssertTrue(app.staticTexts["Do this on Test Mac mini."].waitForPresence(timeout: 10))
        let unconfirmed = try await home("secrets-state", method: "GET")
        XCTAssertEqual((unconfirmed["devices"] as? [Any])?.count, 0)
        let confirmed = try await home("secrets-confirm")
        XCTAssertEqual(confirmed["title"] as? String, enrollment)
        XCTAssertEqual(confirmed["code"] as? String, shown, "The computer's card shows the code this phone shows")
        XCTAssertEqual(confirmed["confirmed"] as? Int, 1, "Enrolling asked for this computer's own confirmation once")
        let devices = try XCTUnwrap(confirmed["devices"] as? [[String: Any]])
        XCTAssertEqual(devices.count, 1); XCTAssertEqual(devices.first?["code"] as? String, shown)
        XCTAssertTrue(cardHeading(enrollment).waitForAbsence(timeout: 20), app.debugDescription)
        openSettings()
        XCTAssertTrue(app.staticTexts["approval-enrolled"].waitForPresence(timeout: 20), app.debugDescription)
        XCTAssertEqual(app.switches["approval-switch"].value as? String, "1", "The switch reads on once the computer confirmed")
        picture("secrets-settings-enrolled")
        closeSettings()

        // One use waits on the computer; this phone allows it once, with Face ID.
        let first = try await home("secrets-request")
        XCTAssertEqual(first["state"] as? String, "waiting")
        let title = try XCTUnwrap(first["title"] as? String)
        showCard(title)
        let allow = app.buttons["approval-allow"]
        XCTAssertTrue(allow.waitForPresence(timeout: 20), app.debugDescription)
        XCTAssertEqual(allow.label, "Allow once")
        XCTAssertTrue(app.staticTexts["approval-note"].label.hasPrefix("Each Allow here asks for Face ID"), app.staticTexts["approval-note"].label)
        // The computer's own approval body (INF-1690's plan) says who asks and why, in the open.
        func body(_ words: String) -> XCUIElement {
            app.webViews.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", words)).firstMatch
        }
        for words in ["Asked by the crewmate on", "Read my next planning meeting"] {
            XCTAssertTrue(body(words).waitForPresence(timeout: 20), app.debugDescription)
        }
        // INF-1109: the shared body says confirmation comes before sharing without naming a device, and that
        // temporary access is only the computer's; no Allow here offers it.
        XCTAssertTrue(body("asks you to confirm first").exists, app.debugDescription)
        XCTAssertFalse(body("Your computer asks you to confirm").exists, app.debugDescription)
        // INF-4087: the line beside the computer's Allow for 10 minutes says the read is only the computer's.
        let temporary = body("On your computer, repeats only this exact read")
        XCTAssertTrue(temporary.exists, app.debugDescription)
        // INF-1109 and INF-1690: the card names the requested secret as the computer's Settings names it - this
        // lone saved secret by its name alone, with no place, reference or version - and the task that asked; the
        // title names this one secret, so the foot does not repeat it, and the choices stay in the card's frame
        // rather than scrolling away with its body.
        let cardTitle = app.staticTexts["card-title"]
        XCTAssertTrue(cardTitle.waitForPresence(timeout: 10), app.debugDescription)
        XCTAssertEqual(cardTitle.label, title)
        XCTAssertTrue(title.contains("the Planning calendar secret to "), title)
        XCTAssertFalse(app.staticTexts["approval-secret-calendar"].exists, app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["card-frame"].exists, "The choices stay pinned: \(app.debugDescription)")
        // The choices take a press once the computer's body is revealed at its drawn height, as every card's do.
        waitUntilEnabled(allow)
        XCTAssertTrue(allow.isHittable, app.debugDescription)
        picture("secrets-use")
        // The scope lies below an iPhone's fold; the body scrolls to it while the pinned choices stay.
        let reading = app.scrollViews["card-scroll"]
        revealPhoneCardReading(temporary, in: reading, app: app)
        XCTAssertTrue(phoneCardReadingBounds(reading, app: app).contains(phoneAccessibilityBounds(temporary.frame)),
            "The scope reads whole \(temporary.frame) inside \(phoneCardReadingBounds(reading, app: app))")
        XCTAssertTrue(allow.isHittable, app.debugDescription)
        picture("secrets-use-scope")
        let waiting = try await home("secrets-state", method: "GET")
        let asked = try XCTUnwrap(waiting["confirmed"] as? Int)
        // perform() puts a failed approval in the card's error foot, not the body's informational notice.
        let confirmationError = app.staticTexts["card-error"]
        XCTAssertFalse(confirmationError.exists, app.debugDescription)
        var confirmationProblem: String?
        func confirmationRefused() -> Bool {
            if confirmationProblem != nil { return true }
            guard confirmationError.exists else { return false }
            confirmationProblem = confirmationError.label
            return true
        }
        func requireConfirmationNotRefused() async throws {
            guard confirmationRefused() else { return }
            picture("secrets-confirmation-refused")
            let refused = try await home("secrets-state", method: "GET")
            let pending = try XCTUnwrap((refused["uses"] as? [[String: Any]])?.first {
                $0["request"] as? String == first["request"] as? String
            })
            XCTAssertEqual(pending["state"] as? String, "waiting", "A failed confirmation leaves the same use waiting")
            XCTAssertEqual(refused["sent"] as? [Bool], [], "An unconfirmed Allow sends nothing")
            XCTAssertEqual(refused["confirmed"] as? Int, asked, "A failed phone confirmation does not ask on the computer")
            throw NSError(domain: "PhoneSecretsConfirmation", code: 1, userInfo: [NSLocalizedDescriptionKey:
                "The phone did not confirm the use: \(confirmationProblem ?? "No confirmation result")"])
        }
        reveal(allow); tapOnPhone(allow, repeatDiscarded: false)
        // INF-1109: the system can fail to start Face ID. That is a terminal refusal, not an optional permission
        // alert still to come. Observe the card's error too, keep the no-send proof, and never retry Allow.
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let permitted = springboard.alerts.buttons["OK"]
        _ = waitForPhonePredicate(NSPredicate { _, _ in confirmationRefused() || permitted.exists }, object: nil, timeout: 10)
        try await requireConfirmationNotRefused()
        if permitted.exists { picture("secrets-face-id-permission"); tapOnPhone(permitted, repeatDiscarded: false) }
        picture("secrets-face-id")
        _ = try await home("face-in-view")
        let confirmationEnded = waitForPhonePredicate(NSPredicate { _, _ in
            confirmationRefused() || !self.cardHeading(title).exists
        }, object: nil, timeout: 30)
        // Stop the owned simulator's face before an assertion can end this test, including a late refusal.
        _ = try await home("face-away")
        try await requireConfirmationNotRefused()
        guard confirmationEnded == .completed else {
            throw NSError(domain: "PhoneSecretsConfirmation", code: 2, userInfo: [NSLocalizedDescriptionKey:
                "The phone did not finish its confirmation: \(app.debugDescription)"])
        }
        XCTAssertTrue(cardHeading(title).waitForAbsence(timeout: 30), app.debugDescription)
        picture("secrets-allowed")
        var state = try await home("secrets-state", method: "GET")
        let enrolled = try XCTUnwrap(devices.first?["device"] as? String)
        let allowed = try XCTUnwrap((state["history"] as? [[String: Any]])?.first { $0["request"] as? String == first["request"] as? String })
        XCTAssertEqual(allowed["state"] as? String, "completed")
        XCTAssertEqual(allowed["approval"] as? String, "remote")
        XCTAssertEqual(allowed["device"] as? String, enrolled)
        XCTAssertEqual(state["sent"] as? [Bool], [true], "The calendar received the entry once")
        XCTAssertEqual(state["confirmed"] as? Int, asked, "An Allow from this phone asks for no confirmation on the computer")

        // Deny needs no Face ID and runs nothing.
        let second = try await home("secrets-request")
        showCard(title)
        let deny = app.buttons["approval-deny"]
        XCTAssertTrue(deny.waitForPresence(timeout: 20), app.debugDescription)
        // A press while the body still lays out could land beside a moving choice; it waits for the reveal gate.
        waitUntilEnabled(deny)
        reveal(deny); tapOnPhone(deny, repeatDiscarded: false)
        XCTAssertTrue(cardHeading(title).waitForAbsence(timeout: 20), app.debugDescription)
        state = try await home("secrets-state", method: "GET")
        let denied = try XCTUnwrap((state["history"] as? [[String: Any]])?.first { $0["request"] as? String == second["request"] as? String })
        XCTAssertEqual(denied["state"] as? String, "denied")
        XCTAssertEqual(state["sent"] as? [Bool], [true], "A refusal sends nothing")
        XCTAssertEqual((state["cards"] as? [Any])?.count, 0)

        // INF-4241 removed the damaged-record relaunch and the computer stopping approvals from this journey: the phone's
        // side is PhoneSecretsTests' and ApprovalStorageTests', and the damaged key ApprovalKeyTests', on the same rules.
    }


}
