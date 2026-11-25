import SwiftUI
import XCTest
@testable import Infinitary
@testable import InfinitaryKit

@MainActor final class PhoneMaintainerWaitTests: XCTestCase {
    private struct Fixture: Decodable {
        let row: PhoneTask
        let facts: Facts
        struct Facts: Decodable {
            let status: Status
            struct Status: Decodable { let reason: String }
        }
    }

    func testPublishedMaintainerWaitKeepsTheDesktopReasonAndIdleScene() throws {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "PhoneMaintainerWait.generated", withExtension: "json"))
        let data = try Data(contentsOf: url)
        let fixture = try JSONDecoder().decode(Fixture.self, from: data)
        let raw = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let envelope: [String: Any] = [
            "seq": 1, "tasks": [try XCTUnwrap(raw["row"])], "projects": [[String: Any]](),
        ]
        let boardData = try JSONSerialization.data(withJSONObject: envelope)
        let board = try JSONDecoder().decode(PhoneBoard.self, from: boardData)
        let roster = PhoneSceneRoster(board: board, presence: [], homeName: "Test computer", inReach: true, generation: 1)
        let computer = try XCTUnwrap(roster.computers.first { $0.tasks.contains { $0.id == fixture.row.id } })
        let task = try XCTUnwrap(computer.tasks.first { $0.id == fixture.row.id })
        let status = PhoneTaskFacts.status(task)
        let sceneWords = PhoneSceneRoster.words(task, computer: computer)
        print("NATIVE_MAINTAINER_WAIT status=\(status.reason) scene=\(sceneWords) working=\(PhoneSceneRoster.working(task))")
        XCTAssertEqual(task.workPosture?.maintainers, true)
        XCTAssertEqual(status.reason, fixture.facts.status.reason)
        XCTAssertEqual(sceneWords, fixture.facts.status.reason)
        XCTAssertFalse(PhoneSceneRoster.working(task))
        XCTAssertNil(PhoneSceneRoster.wait(task))
        let frame = PhoneSceneMotion().frame(roster: roster, now: 0, settled: true)
        let glyph = try XCTUnwrap(frame.glyphs.first { $0.task.id == task.id })
        XCTAssertEqual(glyph.work, 0)
        XCTAssertEqual(glyph.wait, 0)
        for scheme in [ColorScheme.dark, .light] {
            let cache = CharacterPainter.Cache()
            let renderer = ImageRenderer(content: Canvas { context, _ in
                PhoneCrewPainter.draw(frame, roster: roster, now: 0, still: true, in: &context, palette: cache.palette(context.environment))
                var center = context
                center.translateBy(x: roster.homeX - 140, y: roster.height / 2 - 140)
                CharacterPainter.draw(.still(.idle, at: 0), in: &center, size: CGSize(width: 280, height: 280), cache: cache)
            }.frame(width: roster.width, height: roster.height).background(PhoneTheme.background).environment(\.colorScheme, scheme))
            renderer.scale = 1
            let picture = XCTAttachment(image: try XCTUnwrap(renderer.uiImage))
            picture.name = "maintainer-wait-" + (scheme == .dark ? "dark" : "light")
            picture.lifetime = .keepAlways
            add(picture)
        }
    }
}
