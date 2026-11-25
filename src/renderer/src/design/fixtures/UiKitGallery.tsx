import {
  Badge,
  BucketBadge,
  Button,
  Disclosure,
  Empty,
  FeedLine,
  GroupedChecks,
  GroupedPills,
  IconButton,
  Input,
  KeyCap,
  MenuPanel,
  MicroLabel,
  PanelExpandChevron,
  PanelTaskKeyText,
  PinGlyph,
  QuotaMeter,
  QuotaMicroMeter,
  Row,
  RowMenu,
  SecretField,
  SlotBadge,
  StatusDot,
  Switch,
  TaskKey,
  TaskKeyWords,
  TaskStatusMark,
} from "../index";

/**
 * Every library component a panel may render, once each, at one width.
 *
 * It exists for the coherence check: the same gallery is mounted INSIDE a
 * side panel and OUTSIDE one, so a component that renders differently in a
 * panel - because a panel-scoped rule reached it - shows it side by side,
 * judged by eye like every look (docs/testing.md, "The e2e assertion
 * contract"). That is the promise of "build from the app's own components".
 *
 * The stage's own furniture (CardStack, ResponseCard, SubscriptionCard,
 * VoiceInput) is deliberately absent: it is exported because the library is
 * one barrel, it is not panel material, and it does not fit a rail.
 * `personalFixtures.test.tsx` pins that list so a NEW component cannot be
 * quietly left out of the check.
 */

/** Library exports the gallery does not render, and why. */
export const STAGE_ONLY_EXPORTS: readonly string[] = [
  "CARD_STACK_WIDTH",
  "CardStack",
  "ResponseCard",
  "SubscriptionCard",
  "VoiceInput",
];

/**
 * Library exports that draw nothing of their own, so there is nothing to
 * compare inside and outside a panel: the task status words, the shared
 * grouping, the keyboard's focus ring and the in-place reveal a panel that
 * draws tasks uses beside `TaskStatusMark` (FI3-1014 piece 6), the
 * app's own words for a task's search, a feed line's age and Drop task's
 * question (piece 7), the overflow-title helpers a panel may use, and what
 * an automation rule says, which Settings and the Automation panel share.
 * The blocked-by and wait projections and the shared minute clock draw nothing themselves.
 * The pin button's Pin and Unpin words, and which pinned work is past the board's week, draw nothing.
 * The keys that walk a menu and a popover's open-and-close motion draw nothing either.
 */
export const HELPER_EXPORTS: readonly string[] = [
  "AUTOMATION_STATE_TONES",
  "AUTOMATION_STATE_WORDS",
  "automationCount",
  "automationNextShort",
  "automationNextWords",
  "automationRuleTitle",
  "automationWhenWords",
  "DEPENDENCY_VISUAL",
  "DROP_TASK_LABEL",
  "dropConfirmLead",
  "dropPartsLine",
  "dropReviewKeys",
  "dropUnderwayLine",
  "dropWaitingLine",
  "feedRelativeAge",
  "foldForSearch",
  "listEdges",
  "NOW_GROUPS",
  "NOW_GROUP_LABELS",
  "NOW_GROUP_TITLES",
  "focusWithRing",
  "nowCountGroupOf",
  "nowGroupOf",
  "nowGroupsOf",
  "taskStatusLabel",
  "taskStatusOf",
  "taskWaitSummary",
  "waitChainWords",
  "waitStopsOf",
  "waitRecordedTime",
  "useInPlaceReveal",
  "useMinute",
  "textIsHidden",
  "useOverflowTitle",
  "useRestLabel",
  "usePanelTaskKeys",
  "litTaskIn",
  "PIN_LABEL",
  "PIN_WORDS",
  "UNPIN_LABEL",
  "pinActionLabel",
  "pinnedPastWeek",
  "stepMenuFocus",
  "usePopoverPresence",
];

/** A gallery's pointing goes nowhere: it has no tasks to point at. */
const NO_POINT = { peekTask: () => {}, openRecord: () => Promise.resolve(false) };

const check = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

function Item({ name, children }: { name: string; children: React.ReactNode }) {
  return <div data-ui-kit-item={name}>{children}</div>;
}

export function UiKitGallery() {
  return (
    <div
      data-ui-kit-gallery=""
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        fontSize: "var(--text-sm)",
        lineHeight: "var(--leading-body)",
        color: "var(--fg-2)",
      }}
    >
      <Item name="MicroLabel">
        <MicroLabel count={3}>Working</MicroLabel>
      </Item>
      <Item name="TaskStatusMark">
        <TaskStatusMark reading={{ mark: "working", word: "working", reason: "" }} />
      </Item>
      <Item name="Row">
        <Row title="Refactor the auth middleware" tone="warn" trailing="FM3K-9" />
      </Item>
      <Item name="FeedLine">
        <FeedLine kind="report" tone="ok" time="4m" taskKey="FM3K-9">
          Test matrix green across three machines
        </FeedLine>
      </Item>
      <Item name="Empty">
        <Empty>Nothing working</Empty>
      </Item>
      <Item name="TaskKey">
        <TaskKey onRest={() => {}} onOpen={() => {}}>
          FM3K-9
        </TaskKey>{" "}
        <TaskKey look="quiet" onRest={() => {}} onOpen={() => {}}>
          FM3K-12
        </TaskKey>
      </Item>
      <Item name="TaskKeyWords">
        <TaskKeyWords
          text="FM3K-9 waits on FM3K-12"
          linkFor={(key) => (key === "FM3K-12" ? <u>{key}</u> : undefined)}
        />
      </Item>
      <Item name="PanelTaskKeyText">
        <PanelTaskKeyText
          text="Continues as FM3K-12"
          taskOf={(key) => (key === "FM3K-12" ? "task-12" : undefined)}
          point={NO_POINT}
        />
      </Item>
      <Item name="Disclosure">
        <Disclosure label="Landed" count={7} defaultOpen={false} />
      </Item>
      <Item name="PinGlyph">
        <PinGlyph pinned={false} />
        <PinGlyph pinned />
      </Item>
      <Item name="StatusDot">
        <StatusDot tone="ok" label="Signed in" />
      </Item>
      <Item name="Badge">
        <Badge tone="accent" dot>
          On pace
        </Badge>
      </Item>
      <Item name="SlotBadge">
        <SlotBadge slot="high" />
      </Item>
      <Item name="BucketBadge">
        <BucketBadge bucket="medium" />
      </Item>
      <Item name="KeyCap">
        <KeyCap>⌥</KeyCap>
      </Item>
      <Item name="Switch">
        <Switch checked label="Compact rows" />
      </Item>
      <Item name="GroupedPills">
        <GroupedPills
          name="Delivery"
          htmlName="ui-kit-delivery"
          value="direct-pr"
          options={
            [
              { value: "direct-pr", label: "direct PR" },
              { value: "local-only", label: "local only" },
            ] as const
          }
        />
      </Item>
      <Item name="GroupedChecks">
        <GroupedChecks
          name="Days"
          values={["1", "5"]}
          options={[
            { value: "1", label: "Mon", ariaLabel: "Monday" },
            { value: "3", label: "Wed", ariaLabel: "Wednesday" },
            { value: "5", label: "Fri", ariaLabel: "Friday" },
          ]}
        />
      </Item>
      <Item name="Input">
        <Input placeholder="Filter" />
      </Item>
      <Item name="SecretField">
        <SecretField
          aria-label="Secret value"
          value={"-----BEGIN KEY-----\nabc\n-----END KEY-----"}
        />
      </Item>
      <Item name="Button">
        <Button variant="secondary" size="sm">
          Add a note
        </Button>
      </Item>
      <Item name="IconButton">
        <IconButton label="Accept">{check}</IconButton>
      </Item>
      <Item name="RowMenu">
        <RowMenu label="Row actions" items={[{ id: "open", label: "Open" }]} size={24} />
      </Item>
      <Item name="MenuPanel">
        <MenuPanel
          label="Group tasks"
          items={[
            { id: "status", label: "By status", chosen: true },
            { id: "tag", label: "By tag", chosen: false },
          ]}
          style={{ position: "static" }}
          onPick={() => {}}
        />
      </Item>
      <Item name="QuotaMicroMeter">
        <QuotaMicroMeter label="session" percentRemaining={62} pace="behind" clockPercent={40} />
      </Item>
      <Item name="QuotaMeter">
        <QuotaMeter label="weekly" percentRemaining={38} pace="ahead" resetText="resets Fri" />
      </Item>
      <Item name="PanelExpandChevron">
        <PanelExpandChevron collapsed={false} />
      </Item>
    </div>
  );
}
