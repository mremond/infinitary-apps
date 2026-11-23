import { appFollowLine } from "@shared/appFollow";
import { offersAddressChange, offersHomeMove, offersStandby } from "@shared/deviceActs";
import { HERE } from "@shared/deviceNames";
import {
  appBehind,
  approvesSecretUses,
  appUpdateOffered,
  automaticStartupOf,
  automaticStartupWords,
  type DeviceView,
  deviceConnecting,
  deviceLabel,
  deviceRunsWork,
  deviceWords,
  installedThere,
} from "@shared/devices";
import * as m from "@shared/i18n/messages.generated";
import { remoteLoginWords } from "@shared/remoteLogin";
import { RUNS_ON_THIS_MAC } from "@shared/repos";
import { runsForAnotherFirstmate, sshConnectionWords } from "@shared/sshConnection";
import type { StandbyView } from "@shared/standby";
import type React from "react";
import { Fragment, useState } from "react";
import { Button, GroupedPills, Input, RowMenu, type RowMenuItem } from "../design";
import { sshMustBeOn } from "../devices/NearbyList";
import { useHereAs } from "../devices/useFirstMatePlace";
import type { CarryAsk, DevicesTabViewProps } from "./devicesState";
import {
  addingWords,
  deviceIdentity,
  deviceStatus,
  deviceSummary,
  heldLine,
  offersFixWork,
  type RowAct,
  removeLines,
  sshStoppedLine,
  strandedLine,
  updateWorkLine,
  wayBack,
  workSetupLine,
} from "./devicesWords";
import { PhoneApprovals } from "./PhoneApprovals";
import { StandbyLine } from "./Standby";

/** One thing on a row that needs the captain: its sentence, and the one button that answers it. */
type Notice = {
  id: string;
  text: string;
  tone?: "warn" | undefined;
  act?: React.ReactNode;
  /** The strip's own data hooks, kept from the lines it replaced. */
  hook?: Record<string, string>;
};

/**
 * One device in Settings -> Devices (design skill
 * `components/devices/DevicesTab`, "The row"), in three parts that every
 * state fills in the same order: the head, its dot, name, one status and the
 * ⋯ menu; the facts under it; then one strip per thing that needs the
 * captain, its sentence beside its one button. The rarely used actions wait
 * in the ⋯ menu, Remove last. When each is offered is `@shared/deviceActs`'s
 * rule; this row only places it. Change address, Remove and Carry its tasks
 * on stand in its place as a question (below).
 */
export function DeviceRow({
  device,
  devices,
  signIns,
  now,
  updating,
  updateCopy,
  adding,
  busy,
  onAskRemove,
  onUpdate,
  onKeep,
  onAskCarry,
  onMake,
  moving,
  onTryAgain,
  onFixWork,
  onUpdateApp,
  onUpdateLater,
  onAskChangeAddress,
  onAskMoveHome,
  standby,
  onKeepCopy,
  onAskStandbyReady,
}: DevicesTabViewProps & {
  device: DeviceView;
  /** Opens the Ready list for moving the first mate there; absent in a window of another computer. */
  onAskMoveHome?: (deviceId: string) => void;
  /** Where its copy of the first mate stands; undefined while it keeps none. */
  standby?: StandbyView | undefined;
  /** Keep a copy here; absent where copies cannot be kept. */
  onKeepCopy?: (deviceId: string) => void;
  /** Opens its Ready to take over list. */
  onAskStandbyReady?: (deviceId: string) => void;
}) {
  const here = useHereAs();
  const label = deviceLabel(device);
  const works = deviceRunsWork(device.kind);
  const own = signIns.find((entry) => entry.deviceId === device.id);
  // Its crew's work being saved before its update is part of that update, whichever window asked it.
  const saving = works && device.updateWork?.state === "saving";
  const updatingHere = works && (updating.includes(device.id) || saving);
  const copy = updateCopy?.[device.id];
  // Brought back over Remote Login: reached, then told where this Mac is now.
  const finding = works ? adding.find((mac) => mac.deviceId === device.id) : undefined;
  // Looked for at another address, to be reached there from now on.
  const moved = works ? moving.find((each) => each.deviceId === device.id) : undefined;
  const settling =
    works &&
    (device.removal === "bringing-work" ||
      device.removal === "cleaning-up" ||
      device.carrying !== undefined ||
      updatingHere ||
      finding !== undefined ||
      moved !== undefined);
  const status = deviceStatus(device, now);
  const other = works ? device.otherVersion : undefined;
  const notices = works
    ? computerNotices({
        device,
        devices,
        label,
        settling,
        updatingHere,
        busy,
        here,
        onUpdate,
        onKeep,
        onAskCarry,
        onMake,
        onTryAgain,
        onFixWork,
        onAskChangeAddress,
      })
    : [];
  // Saving work before its update (docs/devices.md, "Saving work before an update"): what it
  // waits for, beside Update later, which lets the update go and keeps the work running.
  const workLine = updateWorkLine(device);
  if (saving && workLine)
    notices.unshift({
      id: "update-saving",
      text: here(workLine),
      hook: { "data-device-update-saving": "" },
      act: onUpdateLater ? (
        <Button
          variant="secondary"
          size="sm"
          aria-label={m.devicesUpdateLaterNamed({ device: label })}
          data-device-update-later={device.id}
          onClick={() => onUpdateLater(device.id)}
        >
          {m.devicesUpdateLater()}
        </Button>
      ) : undefined,
    });
  const versions = deviceWords.copyVersions(device);
  const behind = device.appVersion !== undefined && appBehind(device, device.appVersion);
  // A copy behind this computer's is something to act on; any other difference is a plain fact.
  if (versions && behind && !updatingHere)
    notices.push({
      id: "copy-versions",
      text: here(versions),
      tone: "warn",
      hook: { "data-device-copy-versions": "", "data-behind": "" },
    });
  // The app there following this computer's version (docs/devices.md, "Updating the app open
  // there"): the step it is at, beside Update app, which gets the version now and starts it again
  // once no words are left unsent there.
  const follow = behind && !updatingHere ? device.appVersion?.follow : undefined;
  if (follow)
    notices.push({
      id: "app-follow",
      text: appFollowLine(follow),
      tone: follow.step === "cannot" || follow.step === "failed" ? "warn" : undefined,
      hook: { "data-device-app-follow": follow.step },
      act:
        !settling &&
        onUpdateApp &&
        device.appVersion &&
        appUpdateOffered(device, device.appVersion) ? (
          <Button
            variant="secondary"
            size="sm"
            aria-label={m.devicesUpdateAppNamed({ device: label })}
            data-device-update-app={device.id}
            onClick={() => onUpdateApp(device.id)}
          >
            {m.devicesUpdateApp()}
          </Button>
        ) : undefined,
    });
  const acts = rowActs({
    device,
    settling,
    standby,
    moveHome: onAskMoveHome !== undefined,
    keepCopy: onKeepCopy !== undefined,
    readyList: onAskStandbyReady !== undefined,
  });
  const picks: Record<Exclude<RowAct, "remove">, { label: string; onSelect: () => void }> = {
    address: {
      label: m.settingsDevicesChangeAddress(),
      onSelect: () => onAskChangeAddress(device.id),
    },
    "home-move": { label: m.settingsDevicesMoveHere(), onSelect: () => onAskMoveHome?.(device.id) },
    "standby-ready": {
      label: m.settingsDevicesStandbyReady(),
      onSelect: () => onAskStandbyReady?.(device.id),
    },
    "standby-keep": {
      label: m.settingsDevicesStandbyKeep(),
      onSelect: () => onKeepCopy?.(device.id),
    },
  };
  // Remove stands last, in the danger tone, behind a separator when anything comes before it.
  const items: RowMenuItem[] = acts.flatMap((act): RowMenuItem[] =>
    act === "remove"
      ? [
          ...(acts.length > 1 ? [{ separator: true } as const] : []),
          {
            id: act,
            label: m.settingsDevicesRemoveButton(),
            tone: "danger",
            onSelect: () => onAskRemove(device.id),
          },
        ]
      : [{ id: act, ...picks[act] }],
  );
  const summary = works
    ? here(
        finding
          ? addingWords(finding, label)
          : moved
            ? remoteLoginWords.reachingRow(moved.address)
            : device.carrying
              ? m.settingsDevicesCarrying({ to: carryName(devices, device.carrying) })
              : updatingHere
                ? copy?.download
                  ? remoteLoginWords.downloading(label, copy.download.received, copy.download.total)
                  : copy?.state === "sending"
                    ? remoteLoginWords.sendingRow(label, copy.sent ?? 0)
                    : copy?.state === "starting"
                      ? remoteLoginWords.startingRow(label)
                      : remoteLoginWords.updatingRow(device)
                : deviceSummary(device, own),
      )
    : deviceSummary(device, undefined);
  return (
    <div
      className="fm-devices-row fm-devices-entry"
      data-device-row={device.id}
      data-controlling={device.controlling ? "" : undefined}
      data-removal={device.removal}
      data-other-version={other ? (other.takesWork ? "takes-work" : "no-work") : undefined}
      data-device-acts={acts.join(" ")}
    >
      <div className="fm-devices-head">
        <span
          className="fm-devices-dot"
          data-device-dot=""
          data-tone={
            !works
              ? device.inReach
                ? "ok"
                : "warn"
              : device.inReach && other?.takesWork !== false
                ? "ok"
                : deviceConnecting(device) || device.ssh?.state === "reconnecting"
                  ? "idle"
                  : "warn"
          }
        />
        <span className="fm-devices-name">{label}</span>
        {!settling && (
          <span className="fm-devices-state" data-device-status="" data-tone={status.tone}>
            {status.text}
          </span>
        )}
        {items.length > 0 && (
          <RowMenu
            className="fm-devices-more"
            label={m.settingsDevicesRowActions({ device: label })}
            items={items}
          />
        )}
      </div>
      <div className="fm-devices-facts">
        <span className="fm-devices-detail" data-device-identity="">
          <DetailParts text={here(deviceIdentity(device, now))} />
        </span>
        {summary && (
          <span className="fm-devices-summary" role={settling ? "status" : undefined}>
            {summary}
          </span>
        )}
        {!saving && workLine && (
          <span className="fm-devices-summary" role="status" data-device-update-resuming="">
            {here(workLine)}
          </span>
        )}
        {versions && !behind && !updatingHere && (
          <span className="fm-devices-version" data-device-copy-versions="">
            {here(versions)}
          </span>
        )}
        {standby && <StandbyLine view={standby} now={now} />}
        {approvesSecretUses(device) && <PhoneApprovals paired={device.id} name={label} />}
      </div>
      {notices.length > 0 && (
        <div className="fm-devices-notices">
          {notices.map((notice) => (
            <div
              key={notice.id}
              className="fm-devices-notice"
              data-notice={notice.id}
              data-tone={notice.tone}
              {...notice.hook}
            >
              <span className="fm-devices-notice-text" data-notice-text="">
                {notice.text}
              </span>
              {notice.act}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The ⋯ menu's actions for a device, each under `@shared/deviceActs`'s own
 * rule for when it is offered: Change address, Move your first mate here,
 * Ready to take over while it keeps a copy or Keep a copy here, then Remove,
 * which waits while a removal waits or the row is settling. A phone or a Mac
 * that only controls offers Remove alone.
 */
export function rowActs({
  device,
  settling,
  standby,
  moveHome,
  keepCopy,
  readyList,
}: {
  device: DeviceView;
  settling: boolean;
  standby: StandbyView | undefined;
  /** Whether this window can move the first mate, or keep a copy, or open the Ready list. */
  moveHome: boolean;
  keepCopy: boolean;
  readyList: boolean;
}): RowAct[] {
  if (!deviceRunsWork(device.kind)) return ["remove"];
  const acts: RowAct[] = [];
  if (offersAddressChange(device, settling)) acts.push("address");
  if (moveHome && offersHomeMove(device, settling)) acts.push("home-move");
  if (standby && readyList) acts.push("standby-ready");
  else if (keepCopy && offersStandby(device, standby !== undefined)) acts.push("standby-keep");
  if (device.removal !== "when-back" && !settling) acts.push("remove");
  return acts;
}

/**
 * The strips of a computer that runs work, in one fixed order (design skill
 * `components/devices/DevicesTab`, "The row"): what blocks it first, then
 * what waits on it. Each keeps the button it had, beside its sentence.
 */
function computerNotices({
  device,
  devices,
  label,
  settling,
  updatingHere,
  busy,
  here,
  onUpdate,
  onKeep,
  onAskCarry,
  onMake,
  onTryAgain,
  onFixWork,
  onAskChangeAddress,
}: Pick<
  DevicesTabViewProps,
  | "devices"
  | "busy"
  | "onUpdate"
  | "onKeep"
  | "onAskCarry"
  | "onMake"
  | "onTryAgain"
  | "onFixWork"
  | "onAskChangeAddress"
> & {
  device: DeviceView;
  label: string;
  settling: boolean;
  updatingHere: boolean;
  here: (words: string) => string;
}): Notice[] {
  const startup = automaticStartupOf(device);
  const startupProblem = startup === "unavailable" || startup === "unknown";
  const stranded = settling ? null : strandedLine(device);
  const held = settling || startupProblem ? null : heldLine(device);
  const working = settling ? null : workSetupLine(device);
  const fix = !settling && onFixWork !== undefined && offersFixWork(device);
  const back = settling ? null : wayBack(device);
  const stopped = settling ? null : sshStoppedLine(device);
  // A Mac that left for another Firstmate is not coming back: Remove only.
  const left = runsForAnotherFirstmate(device.ssh);
  // Joined again under a new key: the earlier entry out of reach, and what it holds.
  const earlier =
    settling || !device.inReach
      ? undefined
      : devices.find((each) => device.earlier?.includes(each.id));
  const other = device.otherVersion;
  const act = (
    text: string,
    onClick: () => void,
    more: Record<string, string | boolean | undefined> = {},
  ) => (
    <Button variant="secondary" size="sm" onClick={onClick} {...more}>
      {text}
    </Button>
  );
  const notices: Notice[] = [];
  if (device.removal === "when-back")
    notices.push({
      id: "removal",
      text: other
        ? m.settingsDevicesRemovedOnceUpdatedLine()
        : m.settingsDevicesRemovedWhenBackLine(),
      act: act(m.settingsDevicesKeepIt(), () => onKeep(device.id)),
    });
  if (stopped)
    notices.push({
      id: "ssh-stopped",
      text: here(stopped),
      tone: "warn",
      hook: { "data-device-ssh-stopped": "" },
      act: left
        ? undefined
        : act(m.settingsDevicesTryAgain(), () => onTryAgain(device.id), {
            "aria-label": m.settingsDevicesTryAgainNamed({ device: label }),
          }),
    });
  if (stranded)
    notices.push({
      id: "stranded",
      text: here(stranded),
      hook: { "data-device-stranded": "" },
      act: back
        ? act(back.label, () => onMake(back.does), { disabled: busy === "link" })
        : undefined,
    });
  if (working)
    notices.push({
      id: "work-setup",
      text: here(working),
      hook: {
        "data-device-work-setup": device.workSetup?.reason ?? device.workSetup?.state ?? "",
      },
      act: fix
        ? act(m.settingsDevicesFixIt(), () => onFixWork?.(device.id), {
            "aria-label": m.settingsDevicesFixItNamed({ device: label }),
            "data-device-fix-work": device.id,
          })
        : undefined,
    });
  if (held)
    notices.push({
      id: "held",
      text: here(held),
      hook: { "data-device-held": "" },
      act: act(m.settingsDevicesAddByAddress(), () => onAskChangeAddress(device.id), {
        "aria-label": m.settingsDevicesAddByAddressNamed({ device: label }),
      }),
    });
  if (startupProblem && !settling)
    notices.push({
      id: "startup",
      text:
        startup === "unavailable"
          ? automaticStartupWords.guidance
          : automaticStartupWords.unchecked,
      hook: { "data-device-startup": "" },
    });
  if (other && !updatingHere)
    notices.push({
      id: "version",
      text: here(deviceWords.otherVersion(other, installedThere(device))),
      tone: other.takesWork ? undefined : "warn",
      act:
        !settling && device.removal !== "when-back" && !installedThere(device)
          ? act(m.settingsDevicesMatch(), () => onUpdate(device), {
              disabled: busy === "link",
              "aria-label": m.settingsDevicesMatchNamed({ device: label }),
            })
          : undefined,
    });
  if (earlier && onAskCarry)
    notices.push({
      id: "earlier",
      text: earlier.carriesOn
        ? m.settingsDevicesCarryEarlier({ count: earlier.carriesOn })
        : m.settingsDevicesCarryEarlierProjects(),
      hook: { "data-device-earlier": earlier.id },
      act: act(
        m.settingsDevicesCarryHere(),
        () => onAskCarry({ row: device.id, from: earlier.id, to: device.id }),
        {
          "aria-label": m.settingsDevicesCarryHereNamed({ device: label }),
          "data-device-carry-here": earlier.id,
        },
      ),
    });
  if (device.carriesOn && !settling && onAskCarry)
    notices.push({
      id: "tasks-wait",
      text: m.settingsDevicesTasksWait({ count: device.carriesOn }),
      act: act(m.settingsDevicesCarryTo(), () => onAskCarry({ row: device.id, from: device.id }), {
        "aria-label": m.settingsDevicesCarryToNamed({ device: label }),
        "data-device-carry-to": device.id,
      }),
    });
  return notices;
}

/**
 * Change address's one question, in place of the row (design skill
 * `components/devices/DevicesTab`, "Reached over your SSH"): the address
 * the captain reaches that Mac at with SSH now, which this Mac checks is the
 * same computer before it uses it. For a Mac a command added that macOS
 * holds on the local network it is Add it by its address ("Held on the local
 * network"): the address the captain reaches it at with SSH, as the user it
 * runs work as, where this Mac finds it again as the same computer and
 * reaches it over its own SSH connection from then on.
 */
export function AddressChange({
  device,
  onChangeAddress,
  onAddAt,
  onAskChangeAddress,
}: DevicesTabViewProps & { device: DeviceView }) {
  const here = useHereAs();
  const adding = device.heldOnLocalNetwork === true;
  const [address, setAddress] = useState(device.remoteLogin ?? "");
  const typed = address.trim();
  const unchanged = !adding && typed === device.remoteLogin;
  const id = `device-address-${device.id}`;
  return (
    <form
      className="fm-devices-aside"
      data-device-address-change={device.id}
      data-adding={adding ? "" : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (!typed || unchanged) return;
        if (adding) onAddAt(typed);
        else onChangeAddress(device.id, typed);
      }}
    >
      <label className="fm-devices-question" htmlFor={id}>
        {here(sshConnectionWords.changeAddress(device))}
      </label>
      <div className="fm-devices-aside-say">
        {!adding
          ? here(m.settingsDevicesAddressChangeSay())
          : device.user
            ? m.settingsDevicesAddressAddSayAs({ user: device.user, sshOn: sshMustBeOn() })
            : m.settingsDevicesAddressAddSay({ sshOn: sshMustBeOn() })}
      </div>
      <div className="fm-devices-aside-actions">
        <Input
          id={id}
          mono
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder={adding ? `${device.user ?? "you"}@mini.local` : "you@mini.local"}
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          style={{ flex: 1, minWidth: 220, width: "auto" }}
        />
        <Button type="submit" size="sm" disabled={!typed || unchanged}>
          {adding ? m.settingsDevicesAddIt() : m.settingsDevicesAddressChange()}
        </Button>
        <Button variant="ghost" size="sm" type="button" onClick={() => onAskChangeAddress(null)}>
          {m.settingsDevicesCancel()}
        </Button>
      </div>
    </form>
  );
}

/** The name a carry's destination goes by: a computer on the list, or this one. */
function carryName(devices: readonly DeviceView[], id: string): string {
  const device = devices.find((each) => each.id === id);
  return device ? deviceLabel(device) : HERE.this;
}

/**
 * Carry its tasks on's one question, in place of the row it was asked
 * from (docs/devices.md, "Joined again"), with Cancel focused so Enter
 * never moves anything: where the tasks of a computer out of reach
 * continue, from what this computer holds, what stays behind on it, and
 * that it then comes off the list. Asked from the computer that joined
 * again, the destination is that one; asked from the computer out of
 * reach, the captain picks one in reach, or this computer.
 */
export function CarryQuestion({
  ask,
  devices,
  busy,
  onAskCarry,
  onCarry,
}: DevicesTabViewProps & { ask: CarryAsk }) {
  const here = useHereAs();
  const [picked, setPicked] = useState(ask.to ?? "");
  const from = devices.find((each) => each.id === ask.from);
  if (!from) return null;
  const choices = ask.to
    ? []
    : [
        ...devices
          .filter(
            (each) =>
              each.id !== from.id &&
              deviceRunsWork(each.kind) &&
              each.inReach === true &&
              each.removal === undefined &&
              each.carrying === undefined,
          )
          .map((each) => ({ value: each.id, label: deviceLabel(each) })),
        { value: RUNS_ON_THIS_MAC, label: here(HERE.This) },
      ];
  const to = picked ? here(carryName(devices, picked)) : "";
  const fromName = deviceLabel(from);
  // Only tasks that move: a review follows its builder, and Remove now stops it.
  const count = from.carriesOn ?? 0;
  return (
    <div className="fm-devices-row" data-device-carrying={ask.row}>
      <span className="fm-devices-dot" />
      <span className="fm-devices-text">
        {!ask.to && (
          <span className="fm-devices-question" id={`carry-pick-${from.id}`}>
            {m.settingsDevicesCarryPick({ device: fromName })}
          </span>
        )}
        {!ask.to && (
          <span className="fm-devices-aside-actions" data-device-carry-pick="">
            <GroupedPills
              name={m.settingsDevicesCarryPick({ device: fromName })}
              htmlName={`carry-${from.id}`}
              value={picked}
              options={choices}
              onChange={setPicked}
            />
          </span>
        )}
        {to && (
          <span className="fm-devices-question" data-device-carry-ask="">
            {count > 0
              ? here(m.settingsDevicesCarryAsk({ count, to }))
              : m.settingsDevicesCarryAskNone()}
          </span>
        )}
        {to && count > 0 && (
          <span className="fm-devices-question">
            {m.settingsDevicesCarryLeft({ from: fromName })}
          </span>
        )}
        {to && (
          <span className="fm-devices-question">
            {m.settingsDevicesCarryThen({ from: fromName, to })}
          </span>
        )}
      </span>
      <Button
        variant="ghost"
        size="sm"
        autoFocus
        disabled={busy === "carry"}
        onClick={() => onAskCarry?.(null)}
      >
        {m.settingsDevicesCancel()}
      </Button>
      <Button
        size="sm"
        disabled={!picked || busy === "carry"}
        data-device-carry-confirm=""
        onClick={() => picked && onCarry?.(from.id, picked)}
      >
        {m.settingsDevicesCarryConfirm()}
      </Button>
    </div>
  );
}

/**
 * Remove's one question, in place, with Keep it focused so Enter never
 * removes: a Mac that controls this Firstmate is cut off at once; a
 * computer that runs work brings its unmerged work here first; one out of
 * reach asks whether to wait for it or remove it now.
 */
export function RemoveQuestion({
  device,
  busy,
  onAskRemove,
  onRemove,
}: DevicesTabViewProps & { device: DeviceView }) {
  const here = useHereAs();
  const keep = (
    <Button
      variant="ghost"
      size="sm"
      autoFocus
      disabled={busy === "remove"}
      onClick={() => onAskRemove(null)}
    >
      {m.settingsDevicesKeepIt()}
    </Button>
  );
  const lines = removeLines(device).map(here);
  return (
    <div className="fm-devices-row" data-device-removing={device.id}>
      <span className="fm-devices-dot" />
      <span className="fm-devices-text">
        {lines.map((line) => (
          <span key={line} className="fm-devices-question">
            {line}
          </span>
        ))}
      </span>
      {keep}
      {deviceRunsWork(device.kind) && !device.inReach ? (
        <>
          {/* One that runs work for another Firstmate now is not coming back. */}
          {!runsForAnotherFirstmate(device.ssh) && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy === "remove"}
              onClick={() => onRemove(device.id, "when-back")}
            >
              {device.otherVersion
                ? m.settingsDevicesRemoveOnceUpdated()
                : m.settingsDevicesRemoveWhenBack()}
            </Button>
          )}
          <Button
            variant="danger"
            size="sm"
            disabled={busy === "remove"}
            onClick={() => onRemove(device.id, "now")}
          >
            {m.settingsDevicesRemoveNow()}
          </Button>
        </>
      ) : (
        <Button
          variant="danger"
          size="sm"
          pending={busy === "remove"}
          pendingLabel={m.settingsDevicesRemoving()}
          onClick={() => onRemove(device.id)}
        >
          {m.settingsDevicesRemoveButton()}
        </Button>
      )}
    </div>
  );
}

/**
 * A row's detail line, each part kept whole where it fits: a narrow row,
 * its actions beside it, wraps between parts, never inside "seen just now";
 * only a part wider than the whole line wraps inside itself.
 */
function DetailParts({ text }: { text: string }) {
  const parts = text.split(" · ");
  return (
    <>
      {parts.map((part, index) => {
        const last = index === parts.length - 1;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one line, in their order.
          <Fragment key={index}>
            <span className="fm-devices-detail-part">{last ? part : `${part} ·`}</span>
            {last ? "" : " "}
          </Fragment>
        );
      })}
    </>
  );
}
