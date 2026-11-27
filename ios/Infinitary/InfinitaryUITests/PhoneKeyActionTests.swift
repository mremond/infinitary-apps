import XCTest

@MainActor final class PhoneKeyActionTests: XCTestCase {
    // The keyboard-helper repair must drain a pushed page without an animation wait or priming key.
    func testFreshQuiescenceUsesOneRunLoopWaitWithoutAnimations() {
        let app = PhoneKeyTestApplication()
        XCTAssertNil(PhoneWaitForKeyQuiescence(app))
        XCTAssertEqual(app.reads, 1)
        XCTAssertEqual(app.process.waits, [[false, true, false]])
    }

    func testMissingProcessGetterFailsBeforeAnUnsafeCall() {
        XCTAssertTrue(PhoneWaitForKeyQuiescence(NSObject())?.contains("currentProcess") == true)
        XCTAssertTrue(PhoneWaitForKeyQuiescence(PhoneKeyWrongGetter())?.contains("currentProcess") == true)
    }

    // This is the snapshot-error reason from the failed typing step; the bridge must preserve it, not retry.
    func testSnapshotExceptionFailsOnceWithoutInventingDelivery() {
        let reason = "No matches found for Descendants matching type Alert"
        var sent = 0
        XCTAssertThrowsError(try phoneKeyEvent("[") {
            sent += 1
            NSException(name: .genericException, reason: reason, userInfo: nil).raise()
        }) { error in
            XCTAssertTrue(error.localizedDescription.contains(reason))
            XCTAssertTrue(error.localizedDescription.contains("Delivery is unknown; no retry was made."))
        }
        XCTAssertEqual(sent, 1)
    }

    // UIKit publishes pending shortcut updates only with the keyboard attached; registration still gates sending.
    func testAttachmentBracketsOneWaitAndWitnessBeforeOneSend() async throws {
        let failures = PhoneFailures()
        let app = PhoneKeyTestApplication()
        var order: [String] = []
        try await phoneKeyboardReadiness(failures: failures, attach: {
            order.append("attach")
        }, wait: {
            order.append("wait")
            return PhoneWaitForKeyQuiescence(app)
        }, registration: {
            order.append("witness")
        }, detach: {
            order.append("detach")
        })
        try phoneKeyEvent("[", failures: failures) { order.append("send") }
        XCTAssertEqual(order, ["attach", "wait", "witness", "detach", "send"])
    }

    func testRecordedWaitFailureStopsBeforeRegistrationAndDetaches() async {
        let failures = PhoneFailures()
        let reason = "No matches found for Descendants matching type Alert"
        var order: [String] = []
        do {
            try await phoneKeyboardReadiness(failures: failures, attach: {
                order.append("attach")
            }, wait: {
                order.append("wait")
                failures.testCase(self, didRecord: XCTIssue(type: .assertionFailure, compactDescription: reason))
                return nil
            }, registration: {
                order.append("witness")
            }, detach: {
                order.append("detach")
            })
            try phoneKeyEvent("[", failures: failures) { order.append("send") }
            XCTFail("A recorded wait failure must stop the chord")
        } catch {
            XCTAssertTrue(error.localizedDescription.contains("fresh main-run-loop wait failed: " + reason))
            XCTAssertTrue(error.localizedDescription.contains("chord was not sent"))
        }
        XCTAssertEqual(order, ["attach", "wait", "detach"])
    }

    func testRecordedSnapshotReasonSurvivesAGenericSendException() {
        let failures = PhoneFailures()
        let reason = "No matches found for Descendants matching type Alert"
        let interrupted = "XCTest interrupted the action"
        var sent = 0
        XCTAssertThrowsError(try phoneKeyEvent("[", failures: failures) {
            sent += 1
            failures.testCase(self, didRecord: XCTIssue(type: .assertionFailure, compactDescription: reason))
            NSException(name: .genericException, reason: interrupted, userInfo: nil).raise()
        }) { error in
            XCTAssertTrue(error.localizedDescription.contains(reason))
            XCTAssertFalse(error.localizedDescription.contains(interrupted))
            XCTAssertTrue(error.localizedDescription.contains("Delivery is unknown; no retry was made."))
        }
        XCTAssertEqual(sent, 1)
    }


    func testPriorIssueStopsReadinessAndDeliveryWithoutClaimingAnAttempt() async {
        let failures = PhoneFailures()
        let reason = "No matches found for Descendants matching type Alert"
        failures.testCase(self, didRecord: XCTIssue(type: .assertionFailure, compactDescription: reason))
        var order: [String] = []
        do {
            try await phoneKeyboardReadiness(failures: failures, attach: {
                order.append("attach")
            }, wait: {
                order.append("wait"); return nil
            }, registration: {
                order.append("witness")
            }, detach: {
                order.append("detach")
            })
            XCTFail("A prior issue must stop readiness")
        } catch {
            XCTAssertTrue(error.localizedDescription.contains("had already failed before this step: " + reason))
            XCTAssertFalse(error.localizedDescription.contains("attachment failed"))
        }
        XCTAssertThrowsError(try phoneKeyEvent("[", failures: failures) { order.append("send") }) { error in
            XCTAssertTrue(error.localizedDescription.contains("chord was not sent"))
            XCTAssertFalse(error.localizedDescription.contains("Delivery is unknown"))
        }
        XCTAssertEqual(order, ["detach"])
    }

    func testNewAttachmentIssueKeepsItsPhaseAndReasonWhenTheOperationThrows() async {
        let failures = PhoneFailures()
        let reason = "No matches found for Descendants matching type Alert"
        var order: [String] = []
        do {
            try await phoneKeyboardReadiness(failures: failures, attach: {
                order.append("attach")
                failures.testCase(self, didRecord: XCTIssue(type: .assertionFailure, compactDescription: reason))
                throw NSError(domain: "PhoneKeyboardTest", code: 1, userInfo: [NSLocalizedDescriptionKey: "Interrupted"])
            }, wait: {
                order.append("wait"); return nil
            }, registration: {
                order.append("witness")
            }, detach: {
                order.append("detach")
            })
            XCTFail("An attachment issue must stop readiness")
        } catch {
            XCTAssertTrue(error.localizedDescription.contains("keyboard attachment failed: " + reason))
            XCTAssertFalse(error.localizedDescription.contains("Interrupted"))
            XCTAssertFalse(error.localizedDescription.contains("detachment failed"))
        }
        XCTAssertEqual(order, ["attach", "detach"])
    }

    func testAttachmentTimeoutCleansUpWithoutWaitingForRegistrationOrSending() async {
        let failures = PhoneFailures()
        var order: [String] = []
        do {
            try await phoneKeyboardReadiness(failures: failures, attach: {
                order.append("attach")
                throw URLError(.timedOut)
            }, wait: {
                order.append("wait"); return nil
            }, registration: {
                order.append("witness")
            }, detach: {
                order.append("detach")
            })
            try phoneKeyEvent("[", failures: failures) { order.append("send") }
            XCTFail("A timed-out attachment must stop the chord")
        } catch {
            XCTAssertEqual((error as? URLError)?.code, .timedOut)
        }
        XCTAssertEqual(order, ["attach", "detach"])
    }

}

private final class PhoneKeyTestProcess: NSObject {
    var waits: [[Bool]] = []
    @objc(waitForQuiescenceIncludingAnimationsIdle:usingActivity:isPreEvent:)
    func wait(_ animations: Bool, activity: Bool, preEvent: Bool) {
        waits.append([animations, activity, preEvent])
    }
}

private final class PhoneKeyTestApplication: NSObject {
    let process = PhoneKeyTestProcess()
    var reads = 0
    @objc func currentProcess() -> NSObject { reads += 1; return process }
}

private final class PhoneKeyWrongGetter: NSObject {
    @objc func currentProcess() -> Int { 0 }
}
