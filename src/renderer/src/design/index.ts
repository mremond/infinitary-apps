// The typed design-system component library, ported from the design skill
// (.claude/skills/infinitary-design). The skill owns every visual rule;
// these ports keep the mock's visual logic identical.
//
// This barrel is also the `@infinitary/ui` module a panel imports in the
// frame realm (docs/personal-panels.md): every value exported here reaches a
// panel through the frame lib, so adding one is adding to the panel library,
// deliberately.

// What an automation rule says, in Settings → Automation and the
// Automation panel alike (docs/automation.md).
export {
  AUTOMATION_STATE_TONES,
  AUTOMATION_STATE_WORDS,
  automationCount,
  automationNextShort,
  automationNextWords,
  automationRuleTitle,
  automationWhenWords,
} from "@shared/automationWords";
// What a panel that draws tasks draws them with (FI3-1014 piece 6), so its
// rows read as the app's own: the task status mark and its words, the
// shared grouping the Tasks panel and the task board name their lanes by,
// the keyboard's focus ring, and the in-place reveal of a group opening.
export {
  DEPENDENCY_VISUAL,
  type ListEdge,
  type ListTask,
  listEdges,
} from "@shared/dependencyVisual";
export {
  NOW_GROUP_LABELS,
  NOW_GROUP_TITLES,
  NOW_GROUPS,
  type NowGroup,
  nowCountGroupOf,
  nowGroupOf,
  nowGroupsOf,
} from "@shared/nowPanel";
export {
  DROP_TASK_LABEL,
  dropConfirmLead,
  dropPartsLine,
  dropReviewKeys,
  dropUnderwayLine,
  dropWaitingLine,
} from "@shared/recordDrop";
// The app's own words for what such a panel says (piece 7): a task's
// search the way the app folds it, a feed line's age, and Drop task's
// question in the task record's own sentences.
export { feedRelativeAge } from "@shared/relativeAge";
export { foldForSearch } from "@shared/searchText";
// A task's pin (INF-3127): Pin and Unpin in the record's own words.
export {
  PIN_LABEL,
  PIN_WORDS,
  pinActionLabel,
  pinnedPastWeek,
  UNPIN_LABEL,
} from "@shared/taskPin";
export {
  type TaskStatus,
  type TaskStatusReading,
  taskStatusLabel,
  taskStatusOf,
  waitChainWords,
  waitRecordedTime,
} from "@shared/taskPresentation";
export { taskWaitSummary, waitStopsOf } from "@shared/taskWaits";
export { CARD_STACK_WIDTH, CardStack, type CardStackProps } from "./cards/CardStack";
export { ResponseCard, type ResponseCardKind, type ResponseCardProps } from "./cards/ResponseCard";
export { Badge, type BadgeProps, type BadgeTone } from "./core/Badge";
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from "./core/Button";
export type { ImageAttachment } from "./core/ComposerField";
export {
  GroupedChecks,
  type GroupedChecksOption,
  type GroupedChecksProps,
  GroupedPills,
  type GroupedPillsOption,
  type GroupedPillsProps,
} from "./core/GroupedPills";
export { IconButton, type IconButtonProps, type IconButtonTone } from "./core/IconButton";
export { Input, type InputProps } from "./core/Input";
export { KeyCap, type KeyCapProps } from "./core/KeyCap";
// The row menu's own panel, for a panel that opens it from its own control
// (Tasks' Group tasks), with the keys that walk it and its motion.
export { MenuPanel, stepMenuFocus } from "./core/MenuPanel";
export { textIsHidden, useOverflowTitle } from "./core/overflowTitle";
export { PinGlyph } from "./core/PinGlyph";
export { RowMenu, type RowMenuItem, type RowMenuProps } from "./core/RowMenu";
export { useRestLabel } from "./core/restLabel";
export { SecretField, type SecretFieldHandle, type SecretFieldProps } from "./core/SecretField";
export { StatusDot, type StatusDotProps, type StatusDotTone } from "./core/StatusDot";
export { Switch, type SwitchProps } from "./core/Switch";
export { TaskStatusMark } from "./core/TaskStatusMark";
export { useMinute } from "./core/useMinute";
export { focusWithRing } from "./focus";
export { usePopoverPresence } from "./motion";
export { Disclosure, type DisclosureProps } from "./panel/Disclosure";
export { Empty, type EmptyProps } from "./panel/Empty";
export { FeedLine, type FeedLineProps, type FeedLineTone } from "./panel/FeedLine";
export { MicroLabel, type MicroLabelProps } from "./panel/MicroLabel";
export { PanelExpandChevron } from "./panel/PanelExpandChevron";
export { Row, type RowProps } from "./panel/Row";
// A task key as a link, the app's own way (FI3-1271): a panel that reads
// `tasks.board` and `tasks.search` links the keys its words write, and
// resting on one or clicking it points at that task (`point`).
export {
  litTaskIn,
  type PanelTaskKeys,
  PanelTaskKeyText,
  TaskKey,
  type TaskKeyLook,
  type TaskKeyProps,
  TaskKeyWords,
  usePanelTaskKeys,
} from "./panel/TaskKey";
export { QuotaMeter, type QuotaMeterProps, type QuotaPace } from "./quota/QuotaMeter";
export { QuotaMicroMeter, type QuotaMicroMeterProps } from "./quota/QuotaMicroMeter";
// The activity feed (the skill's mate/ActivityFeed) is a Tier-2 side panel
// now: src/renderer/src/plugins/builtin/.
export {
  BucketBadge,
  type BucketBadgeProps,
  type IntelligenceBucket,
  SlotBadge,
  type SlotBadgeProps,
} from "./quota/SlotBadge";
export {
  SubscriptionCard,
  type SubscriptionCardProps,
  type SubscriptionModel,
  type SubscriptionStatus,
  type SubscriptionWindow,
} from "./quota/SubscriptionCard";
export { useInPlaceReveal } from "./reveals";
export { VoiceInput, type VoiceInputMode, type VoiceInputProps } from "./voice/VoiceInput";
