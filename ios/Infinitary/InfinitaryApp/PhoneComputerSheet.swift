import InfinitaryKit
import SwiftUI

struct PhoneReach: View {
    let session: ReadOnlySession
    /// INF-589 item 17: on one line the time it was last heard follows the state.
    var oneLine = false
    var body: some View {
        (oneLine ? AnyLayout(HStackLayout(spacing: PhoneTheme.space2)) : AnyLayout(VStackLayout(spacing: 2))) {
            HStack(spacing: PhoneTheme.space2) {
                Circle().fill(session.reach == "in-reach" ? PhoneTheme.accent : PhoneTheme.warning)
                    .frame(width: 6, height: 6).accessibilityHidden(true)
                Text(session.reachWords).accessibilityIdentifier("contact")
            }
            if let time = session.reachTime { Text(PhoneMessages.phoneReachSince(time: time)) }
        }.font(PhoneFont.micro).foregroundStyle(PhoneTheme.secondary)
    }
}

extension ReadOnlySession {
    /// The reach, in the words the reach line and the computer button share. INF-2668: they follow the patient
    /// `reach`, so a redial the computer answers within the captain's 20 s says nothing. INF-4207 piece 2: Live once
    /// every change is shown, and a catch-up says whether it replays what was missed or reads everything again.
    var reachWords: String {
        switch reach {
        case "in-reach": PhoneMessages.phoneReachLive()
        case "reaching": PhoneMessages.phoneReachReaching()
        case "catching-up":
            catchingUp == "replay" ? PhoneMessages.phoneReachCatchingUp() : PhoneMessages.phoneReachReadingAgain()
        default: PhoneMessages.phoneReachOutOfReach()
        }
    }

    /// Since when the computer is out of reach, naming the day when it was not today; reaching it again needs no time.
    var reachTime: String? {
        guard reach != "in-reach", reach != "reaching", reach != "catching-up", let heardAt else { return nil }
        return PhoneFormats.since(heardAt)
    }

    /// INF-1062: the computer button in the top bar says the reach to VoiceOver, with its time while out of reach.
    var reachLine: String {
        guard let reachTime else { return reachWords }
        return PhoneMessages.phoneReachLineSince(reach: reachWords, time: reachTime)
    }

    /// INF-589 item 11: the reach line says out of reach, so the one line where changes are made says only that
    /// they are off, in the Mac's words (`changesOffWords`, src/renderer/src/devices/viewWords.ts). None while first reaching,
    /// nor while the words still say In reach during a redial (INF-2668).
    var changesOffLine: String? {
        switch reach {
        case "in-reach": contact == "in-reach" ? changeRefusal : nil
        case "reaching": nil
        case "catching-up": contact == "in-reach" ? changeRefusal : nil
        default: PhoneMessages.phoneReachChangesOff(computer: mac.name)
        }
    }
}

/// INF-1062: the computer's own sheet. INF-6131, the captain's pick: one list in the shared row look, the computer
/// shown first with its role, reach and address and a small plain Leave, or Forget while out of reach, at its trailing
/// edge (the Mac draws Leave on its own device row this way); the other kept computers next (INF-5265); and Add another
/// computer last. Leave stays the sheet's first control, so it is in view as the sheet opens at every Text Size.
/// The sheet opens just tall enough for its rows, never past half height, and can still be pulled up (INF-6131).
/// This device's own facts live in `PhoneSettingsSheet`.
struct PhoneComputerSheet: View {
    let session: ReadOnlySession
    let model: PhoneModel
    /// INF-5265: each acts on the computer its confirmation named, even when another shows by the time it is answered.
    let leave: (ReadOnlySession) -> Void
    let forget: (String) -> Void
    /// Opens a way in to join one more computer, after this sheet closes.
    let add: (PhoneAddWay) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var leaving = false
    @State private var forgetting = false
    /// The computer the open confirmation names.
    @State private var named: ReadOnlySession?
    @State private var choosingWay = false
    @FocusState private var focusedRow: String?
    /// The rows' own height, the height the scroll view shows them in, and the whole sheet's height: the sheet less the
    /// scroll view is its bar and edges, so the fitted sheet is the rows plus those.
    @State private var rows: CGFloat = 0
    @State private var shown: CGFloat = 0
    @State private var sheet: CGFloat = 0
    /// The height the sheet stands at, kept while the rows refit so a sheet pulled up stays up.
    @State private var detent = PresentationDetent.custom(PhoneFittedDetent.self)

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: PhoneTheme.space5) {
                    computers
                    // INF-4207 piece 9: while the home is out of reach, a computer that keeps a copy can take over. It
                    // stays through a reopen's Reaching, as Face ID makes, so a takeover under way keeps its row.
                    if session.homeLost, let standbys = session.mac.standbys, !standbys.isEmpty {
                        PhoneTakeOverSection(session: session, standbys: standbys)
                    }
                }.padding(PhoneTheme.space5).frame(maxWidth: .infinity, alignment: .leading)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { rows = $0 }
            }
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { shown = $0 }
            .onAppear { model.lookAtOthers() }
            // Another computer showing closes a confirmation that named the one before.
            .onChange(of: session.mac.pin) { leaving = false; forgetting = false; named = nil }
            .phoneTitle(PhoneMessages.phoneComputerTitle())
            .toolbar { ToolbarItem(placement: .confirmationAction) {
                Button(PhoneMessages.phoneCommonDone()) { dismiss() }.accessibilityIdentifier("close-computer-details")
            } }
            // Alerts keep the cancel choice in view; a popover from the button would hide it.
            .alert(PhoneMessages.phoneComputerLeaveAsk(computer: session.mac.name), isPresented: $leaving) {
                Button(PhoneMessages.phoneComputerLeaveConfirm(), role: .destructive) {
                    dismiss(); if let named { leave(named) }
                }.accessibilityIdentifier("confirm-leave")
                Button(PhoneMessages.phoneComputerKeep(), role: .cancel) {}
            } message: { Text(PhoneMessages.phoneComputerLeaveWarning()) }
            .alert(PhoneMessages.phoneComputerForgetAsk(), isPresented: $forgetting) {
                Button(PhoneMessages.phoneComputerForgetConfirm(), role: .destructive) {
                    dismiss(); if let named { forget(named.mac.pin) }
                }.accessibilityIdentifier("confirm-forget")
                Button(PhoneMessages.phoneComputerKeep(), role: .cancel) {}
            } message: { Text(PhoneMessages.phoneComputerForgetWarning()) }
            .confirmationDialog(PhoneMessages.phoneComputerAddTitle(), isPresented: $choosingWay, titleVisibility: .visible) {
                Button(PhoneMessages.phoneJoinScanTitle()) { pick(.scan) }.accessibilityIdentifier("add-scan-code")
                Button(PhoneMessages.phoneJoinPasteTitle()) { pick(.paste) }.accessibilityIdentifier("add-paste-link")
                Button(PhoneMessages.phoneJoinAddressTitle()) { pick(.address) }.accessibilityIdentifier("add-by-address")
                Button(PhoneMessages.phoneCommonCancel(), role: .cancel) {}
            }
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.height + $0.safeAreaInsets.top + $0.safeAreaInsets.bottom } action: { sheet = $0 }
        .font(PhoneFont.body).foregroundStyle(PhoneTheme.text).tint(PhoneTheme.accent)
        .presentationDetents([.custom(PhoneFittedDetent.self), .large], selection: $detent).presentationDragIndicator(.visible)
        .presentationContentInteraction(.resizes)
        .environment(\.phoneSheetFit, rows > 0 && shown > 0 && sheet > shown ? rows + sheet - shown : 0).phoneSheetSurface()
    }

    private func pick(_ way: PhoneAddWay) {
        add(way)
        dismiss()
    }

    /// The sheet's one list: the computer shown, the other kept computers, and Add another computer last. A tap on
    /// another computer shows it: the phone never switches by itself (the captain's pick, Stay), so a mark only says
    /// which one answers now. On an iPad keyboard the arrows move among those rows, on to Add another computer, and
    /// Return or Space presses one; a press with Command held is left to the app's own commands.
    private var computers: some View {
        let order = model.kept.others.map(\.pin) + [Self.addRow]
        return PhoneList {
            shownComputer
            ForEach(model.kept.others, id: \.pin) { mac in
                Button { dismiss(); model.show(mac.pin) } label: {
                    PhoneRow(symbol: .computer, title: mac.name, line: answerWords(mac.pin), chevron: true)
                        .overlay(alignment: .leading) {
                            if model.answering[mac.pin] == true {
                                Circle().fill(PhoneTheme.accent).frame(width: 6, height: 6)
                                    .offset(x: PhoneTheme.space2).accessibilityHidden(true)
                            }
                        }
                }
                .accessibilityLabel(mac.name).accessibilityValue(answerWords(mac.pin))
                .accessibilityHint(PhoneMessages.phoneComputerShowHint())
                .accessibilityIdentifier("kept-computer")
                .focusable().focused($focusedRow, equals: mac.pin)
                .onPlainKey(.return) { dismiss(); model.show(mac.pin) }
                .onPlainKey(.space) { dismiss(); model.show(mac.pin) }
                .onPlainKey(.downArrow) { focusedRow = step(order, from: mac.pin, by: 1) }
                .onPlainKey(.upArrow) { focusedRow = step(order, from: mac.pin, by: -1) }
            }
            Button { choosingWay = true } label: {
                PhoneRow(symbol: .plus, title: PhoneMessages.phoneComputerAddTitle(),
                         line: PhoneMessages.phoneComputerAddLine(), chevron: true)
            }
            .accessibilityIdentifier("add-computer")
            .focusable().focused($focusedRow, equals: Self.addRow)
            .onPlainKey(.return) { choosingWay = true }
            .onPlainKey(.space) { choosingWay = true }
            .onPlainKey(.upArrow) {
                if let last = model.kept.others.last { focusedRow = last.pin }
            }
        }.buttonStyle(PhoneRowStyle()).frame(maxWidth: .infinity, alignment: .leading)
            // With other computers kept, the sheet opens with the first of them focused, so a keyboard's arrows and
            // Return reach the list at once.
            .onAppear { if !model.kept.others.isEmpty { focusedRow = order.first } }
    }

    /// The computer shown, the list's first row: its glyph at the name's height, the name, its role, and under them
    /// one line of small type with the reach and then the address reached. Leave, or Forget while out of reach, sits
    /// at the trailing edge beside the name, and drops under the row's lines when the name does not fit beside it.
    private var shownComputer: some View {
        HStack(alignment: .phoneNameLine, spacing: PhoneTheme.space3) {
            PhoneSymbol.computer.image.foregroundStyle(PhoneTheme.accent).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: PhoneTheme.space2) {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: PhoneTheme.space3) {
                        identity(oneLine: true).layoutPriority(1)
                        Spacer(minLength: 0)
                        exitControl
                    }
                    VStack(alignment: .trailing, spacing: 0) {
                        identity(oneLine: false).frame(maxWidth: .infinity, alignment: .leading)
                        exitControl
                    }
                }
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: PhoneTheme.space3) { PhoneReach(session: session, oneLine: true); reachedAddress }
                    VStack(alignment: .leading, spacing: 2) { PhoneReach(session: session, oneLine: true); reachedAddress }
                    VStack(alignment: .leading, spacing: 2) { PhoneReach(session: session); reachedAddress }
                }
            }
        }
        .padding(.horizontal, PhoneTheme.space4).padding(.vertical, PhoneTheme.space3)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
    }

    private func identity(oneLine: Bool) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(session.mac.name).font(PhoneFont.headline).foregroundStyle(PhoneTheme.text)
                .fixedSize(horizontal: oneLine, vertical: false)
                .alignmentGuide(.phoneNameLine) { $0[VerticalAlignment.center] }
                .accessibilityIdentifier("home-name")
            Text(PhoneMessages.phoneComputerCurrentConnection()).font(PhoneFont.caption).foregroundStyle(PhoneTheme.secondary)
        }.multilineTextAlignment(.leading)
    }

    @ViewBuilder private var reachedAddress: some View {
        if let address = session.reachedAddress {
            Text(address).font(PhoneFont.micro).foregroundStyle(PhoneTheme.muted)
                .accessibilityIdentifier("reached-address")
        }
    }

    private static let addRow = "add-computer" // i18n-exempt: a focus name, not shown

    private func step(_ rows: [String], from row: String, by offset: Int) -> String {
        guard let index = rows.firstIndex(of: row) else { return row }
        return rows[min(max(index + offset, 0), rows.count - 1)]
    }

    /// Whether another kept computer answered the phone's last look, in the reach line's words.
    private func answerWords(_ pin: String) -> String {
        switch model.answering[pin] {
        case true: PhoneMessages.phoneComputerAnswers()
        case false: PhoneMessages.phoneComputerNotAnswering()
        default: PhoneMessages.phoneComputerLooking()
        }
    }

    // Close the sheet on confirmation so any failure remains visible in the root's problem notice.
    // INF-6131: a fitted button in the hairline outline, since the row already names the computer and the alert says
    // what leaving costs in the danger color; it keeps the spoken name that names the computer.
    @ViewBuilder private var exitControl: some View {
        if session.contact == "in-reach" {
            Button(PhoneMessages.phoneComputerLeaveShort()) { named = session; leaving = true }
                .buttonStyle(PhoneChoiceStyle(.secondary)).fixedSize()
                .accessibilityLabel(PhoneMessages.phoneComputerLeaveButton(computer: session.mac.name))
                .accessibilityIdentifier("leave")
        } else {
            Button(PhoneMessages.phoneComputerForgetShort()) { named = session; forgetting = true }
                .buttonStyle(PhoneChoiceStyle(.secondary)).fixedSize()
                .accessibilityLabel(PhoneMessages.phoneComputerForgetButton())
                .accessibilityIdentifier("forget-mac")
        }
    }
}

/// INF-6131: the computer sheet opens just tall enough for its rows, and never past half height; before its rows are
/// measured it opens at half height, as it did before.
private struct PhoneFittedDetent: CustomPresentationDetent {
    static func height(in context: Context) -> CGFloat? {
        let half = context.maxDetentValue / 2
        return context.phoneSheetFit > 0 ? min(context.phoneSheetFit, half) : half
    }
}

extension EnvironmentValues {
    /// The height the computer sheet's rows ask for, read by its fitted detent.
    @Entry var phoneSheetFit: CGFloat = 0
}

private extension VerticalAlignment {
    /// The computer row's name line: the glyph and Leave center on it.
    enum PhoneNameLine: AlignmentID {
        static func defaultValue(in context: ViewDimensions) -> CGFloat { context[VerticalAlignment.center] }
    }
    static let phoneNameLine = VerticalAlignment(PhoneNameLine.self)
}

/// INF-5265: the ways in Add another computer offers, the first screen's three.
enum PhoneAddWay { case scan, paste, address }

private extension View {
    /// A key pressed alone; with Command, Option or Control held it is left to the app's own commands, such as
    /// Command-Return, which never presses a row behind it (INF-499).
    func onPlainKey(_ key: KeyEquivalent, _ action: @escaping () -> Void) -> some View {
        onKeyPress(keys: [key], phases: .down) { press in
            guard press.modifiers.isDisjoint(with: [.command, .option, .control]) else { return .ignored }
            action()
            return .handled
        }
    }
}
