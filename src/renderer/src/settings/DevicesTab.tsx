import { anotherUserHere, HERE } from "@shared/deviceNames";
import {
  type DeviceAddresses,
  type DeviceRemoveWhen,
  type DeviceView,
  deviceLabel,
  deviceRunsWork,
} from "@shared/devices";
import { formatNumber } from "@shared/i18n/format";
import * as m from "@shared/i18n/messages.generated";
import { NEARBY_OFF, NEARBY_RENEW_MS, type NearbyMacsView } from "@shared/nearbyMacs";
import {
  addressParts,
  type RemoteLoginConfirmQuestion,
  type RemoteLoginLeaveQuestion,
  type RemoteLoginPasswordQuestion,
  type RemoteLoginRefusedAnswer,
  type RemoteLoginUpdateOptions,
  remoteLoginRefusalLines,
} from "@shared/remoteLogin";
import type { DeviceSignIns } from "@shared/signIns";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import "../accounts/connectChips.css";
import { useShellStore } from "../app/store";
import { thisDesktop } from "../design/core/desktop";
import { useHereAs } from "../devices/useFirstMatePlace";
import { isView, updateThereWords } from "../devices/viewWords";
import { ControllingTab } from "./ControllingTab";
import { AddressChange, CarryQuestion, DeviceRow, RemoveQuestion } from "./DeviceRow";
import {
  AddingRow,
  AddressQuestion,
  ConfirmQuestion,
  LeaveQuestion,
  PasswordQuestion,
} from "./DevicesAdd";
import {
  FirewallLine,
  homeFirewallOf,
  LinkPanelView,
  panelForAnotherComputer,
  WaysSection,
} from "./DevicesLinks";
import { DeviceTopology } from "./DeviceTopology";
import { HomeMoveQuestion, useHomeMove } from "./HomeMove";
import { StandbyQuestion, useStandbyViews } from "./Standby";
import { KeepHomeQuestion } from "./TakeOverSection";
import { TakeoverAddresses } from "./TakeoverAddresses";
import "./devices.css";
import {
  type Busy,
  type CarryAsk,
  type DevicesTabViewProps,
  joinedNoticeClears,
  type LinkPanel,
  type ReachRefusal,
  reachRefusalAfter,
  reachRefusalOf,
  usePanel,
  useSetups,
} from "./devicesState";
import type { DevicePanelMake } from "./devicesWords";
import { SECTION_GAP, SectionLabel, SettingError } from "./settingRows";

/**
 * Settings -> Devices (design skill components/devices/DevicesTab and
 * AddAMac, docs/devices.md): Your devices - this Mac, then each Mac or user
 * added, with when each was last seen, whether a Mac controls this
 * Firstmate now, and what each computer that runs work runs, its sign-ins
 * and its tasks, each with Remove - the link or command that adds one, and
 * where devices find this Mac.
 *
 * A link or a command exists only after the captain's own click, here or on
 * Firstmate's card, and lives in its panel alone: it is held in this
 * window's memory, never saved, so a restart forgets it and the panel is
 * simply gone. A card's button lands here with what to do on arrival
 * (`pendingDeviceArrival`).
 *
 * A Mac added by its address stands in the list while this Mac reaches it
 * and sets it up over Remote Login, and a computer whose Firstmate is
 * updating, or that this Mac is telling where it is now, says so on its row
 * (design skill `components/devices/AddAMac`). Each step is a feed line the
 * core says; the rows follow those steps, in this window's memory alone.
 *
 * A computer out of reach since this Mac's address changed says so, with
 * the way back: a new command for one added by a command (design skill
 * `components/devices/DevicesTab`, "Bringing a computer back").
 *
 * A computer added by its address is reached over this Mac's own SSH, which
 * follows this Mac wherever it listens: its row says where that connection
 * stands - connected using SSH only once its work said hello, connecting
 * while the connection is being made (also right after an operation held it
 * or its work's folder moved), reconnecting while this Mac tries again by
 * itself after a drop, when its work starts or that it
 * could not start, and, when only a person can mend it, why, with Try
 * again - and Change address reaches it somewhere else (design skill
 * `components/devices/DevicesTab`, "Reached over your SSH").
 *
 * A computer connected on another version of Firstmate says so, with
 * Update, which brings it to this Mac's version, or makes the command that
 * does for one too old to update from here.
 *
 * Its parts each have their own file: the words and a row's lines
 * (`devicesWords.ts`), the stores and the props every part reads
 * (`devicesState.ts`), adding a computer (`DevicesAdd.tsx`), a device's row
 * and its questions (`DeviceRow.tsx`), the link panel and the ways
 * (`DevicesLinks.tsx`), and Macs nearby (`../devices/NearbyList.tsx`).
 */

const plusIcon = (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/**
 * The tab: the first mate's devices, and on a computer that controls it,
 * which computer and Leave above them (`ControllingTab`, docs/view.md,
 * "Settings on a view"). A first mate there too old to answer its devices
 * to a view says so in their place.
 */
export function DevicesTab() {
  const thisMac = useShellStore((s) => s.thisMac);
  if (!isView(thisMac)) return <HomeDevicesTab />;
  return (
    <>
      <ControllingTab mac={thisMac} />
      <div style={{ marginTop: SECTION_GAP }}>
        {thisMac.devicesNeedUpdateThere ? (
          <div className="fm-devices-say" data-devices-wait="">
            {updateThereWords(thisMac)}
          </div>
        ) : (
          <HomeDevicesTab />
        )}
      </div>
    </>
  );
}

/** What an add by its address carries beyond the address: each the captain's own answer. */
type AddWith = { leave?: boolean; confirm?: string; password?: string };

function canEditAddress(device: DeviceView): boolean {
  return Boolean(device.remoteLogin || device.heldOnLocalNetwork);
}

function HomeDevicesTab() {
  const fromView = useShellStore((s) => isView(s.thisMac));
  const [joinedUbuntuUpdate, setJoinedUbuntuUpdate] = useState(false);
  useEffect(() => {
    if (!fromView) return;
    let live = true;
    void window.infinitary.app
      .healthcheck()
      .then((home) => {
        if (live) setJoinedUbuntuUpdate(home.changes?.includes("joined-ubuntu-update") ?? false);
      })
      .catch(() => {});
    return () => {
      live = false;
      setJoinedUbuntuUpdate(false);
    };
  }, [fromView]);
  const canUpdateByPackageAddress = !fromView || joinedUbuntuUpdate;
  const [devices, setDevices] = useState<DeviceView[]>([]);
  const [signIns, setSignIns] = useState<DeviceSignIns[]>([]);
  const [addresses, setAddresses] = useState<DeviceAddresses | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [carrying, setCarrying] = useState<CarryAsk | null>(null);
  const [changing, setChanging] = useState<string | null>(null);
  const [askingAddress, setAskingAddress] = useState(false);
  const [packageUpdate, showPackageUpdate] = useState<DeviceView | null>(null);
  // Async card lookups and list pushes need the owner before React renders it.
  const packageUpdateOwner = useRef<DeviceView | null>(null);
  const setPackageUpdate = useCallback((worker: DeviceView | null) => {
    packageUpdateOwner.current = worker;
    showPackageUpdate(worker);
  }, []);
  /** The address in By its address, kept across a refusal so it is not retyped. */
  const [addressDraft, setAddressDraft] = useState("");
  /** The port beside it, empty for SSH's own; kept the same way. */
  const [portDraft, setPortDraft] = useState("");
  /** Keeps an address in the two fields it was typed in. */
  const keepTyped = useCallback((address: string) => {
    const parts = addressParts(address);
    setAddressDraft(parts.address);
    setPortDraft(parts.port);
  }, []);
  /** The refusal's lines, in that aside. Null until a try is refused. */
  const [addressRefusal, setAddressRefusal] = useState<readonly string[] | null>(null);
  /** A Cancel during a try ignores that try's refusal, so it does not reopen the aside. */
  const addressTry = useRef(0);
  /** Macs nearby with Remote Login on, looked for while By its address is open. */
  const [nearby, setNearby] = useState<NearbyMacsView>(NEARBY_OFF);
  /** How many pushes of Macs nearby this tab has heard, so an ask's older answer never covers a newer push. */
  const nearbyPushes = useRef(0);
  const [leaving, setLeaving] = useState<RemoteLoginLeaveQuestion | null>(null);
  /** The check line, shown before anything is sent. */
  const [confirming, setConfirming] = useState<RemoteLoginConfirmQuestion | null>(null);
  /** That user's password, asked once; the field itself keeps what is typed. */
  const [passwording, setPasswording] = useState<RemoteLoginPasswordQuestion | null>(null);
  // The worker update's own questions, apart from an add's or another update's,
  // so neither flow's answer overwrites or cancels the other's.
  const [workerConfirming, setWorkerConfirming] = useState<RemoteLoginConfirmQuestion | null>(null);
  const [workerPasswording, setWorkerPasswording] = useState<RemoteLoginPasswordQuestion | null>(
    null,
  );
  // Its own address form too: open, field, port, refusal and try count, so an
  // add or another update never cancels, overwrites or outdates it.
  const [workerAsking, setWorkerAsking] = useState(false);
  const [workerDraft, setWorkerDraft] = useState("");
  const [workerPort, setWorkerPort] = useState("");
  const [workerRefusal, setWorkerRefusal] = useState<readonly string[] | null>(null);
  const workerTry = useRef(0);
  const keepWorkerTyped = useCallback((address: string) => {
    const parts = addressParts(address);
    setWorkerDraft(parts.address);
    setWorkerPort(parts.port);
  }, []);
  const [busy, setBusy] = useState<Busy>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** The "could not reach" refusal in `problem`, with what it was about: that line goes when the computer answers again. */
  const [problemAbout, setProblemAbout] = useState<ReachRefusal | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const { panel, show, clear } = usePanel();
  // The joined note says "no sign-ins yet" until that Mac has one, even if the
  // sign-in event was missed while this tab was closed.
  useEffect(() => {
    if (joinedNoticeClears(panel, signIns)) clear();
  }, [panel, signIns, clear]);
  const { adding, updating: clicked, following, moving, updateCopy } = useSetups();
  // An update this Mac started by itself reads in its row as one clicked here does.
  const updating = following.length > 0 ? [...clicked, ...following] : clicked;
  useEffect(() => useSetups.getState().follow(), []);
  const arrival = useShellStore((s) => s.pendingDeviceArrival);
  const [selected, setSelected] = useState<string | null>(null);
  const cancelAddress = useCallback(() => {
    addressTry.current += 1;
    setAskingAddress(false);
    setAddressRefusal(null);
    setConfirming(null);
    setPasswording(null);
  }, []);
  /** Ends the worker's update flow alone; an add's questions are its own to cancel. */
  const cancelWorkerUpdate = useCallback(() => {
    workerTry.current += 1;
    setWorkerAsking(false);
    setWorkerRefusal(null);
    setWorkerConfirming(null);
    setWorkerPasswording(null);
    setPackageUpdate(null);
  }, [setPackageUpdate]);

  const updateDevices = useCallback(
    (next: DeviceView[]) => {
      setDevices(next);
      const hasDevice = (id: string | null) => next.some((device) => device.id === id);
      if (packageUpdateOwner.current && !hasDevice(packageUpdateOwner.current.id))
        cancelWorkerUpdate();
      setSelected((id) => (hasDevice(id) ? id : null));
      setRemoving((id) => (hasDevice(id) ? id : null));
      setChanging((id) =>
        next.some((device) => device.id === id && canEditAddress(device)) ? id : null,
      );
    },
    [cancelWorkerUpdate],
  );

  useEffect(() => {
    if (!problemAbout) return;
    if (!reachRefusalAfter(problemAbout, devices)) return;
    setProblem((line) => (line === problemAbout.line ? null : line));
    setProblemAbout(null);
  }, [problemAbout, devices]);

  /** A refusal of an update or an address change, answered as data so a reach refusal is told from the rest. */
  const refused = useCallback(
    (deviceId: string, answer: RemoteLoginRefusedAnswer, address?: string) => {
      setProblem(answer.lines.join("\n"));
      setProblemAbout(reachRefusalOf(answer, deviceId, Date.now(), address));
    },
    [],
  );

  const refresh = useCallback(() => {
    void window.infinitary.devices.list().then(updateDevices, () => undefined);
  }, [updateDevices]);

  useEffect(() => {
    refresh();
    void window.infinitary.devices.addresses().then(setAddresses, () => undefined);
    void window.infinitary.devices.signIns().then(setSignIns, () => undefined);
    const offDevices = window.infinitary.devices.onDevices(updateDevices);
    // This Mac's network moves while the tab is open, and the row follows.
    const offAddresses = window.infinitary.devices.onAddresses(setAddresses);
    const offSignIns = window.infinitary.devices.onSignIns(setSignIns);
    const offNearby = window.infinitary.devices.onNearby((view) => {
      nearbyPushes.current += 1;
      setNearby(view);
    });
    return () => {
      offDevices();
      offAddresses();
      offSignIns();
      offNearby();
    };
  }, [refresh, updateDevices]);

  // Macs nearby (docs/devices.md, "Macs nearby"): looked for while By its
  // address is open, asked again inside the core's minute, and stopped
  // once it closes. Only once the home said it adds a computer by its
  // address: never while that is unread, nor on a Windows home.
  const addsByAddress = addresses !== null && addresses.addsByAddress !== false;
  useEffect(() => {
    if (!askingAddress || !addsByAddress) return;
    let open = true;
    const ask = () => {
      const pushes = nearbyPushes.current;
      void window.infinitary.devices.nearby(true).then(
        (view) => {
          // Every change is pushed in order, so once a push arrives after asking, the pushes carry this answer or newer.
          if (open && nearbyPushes.current === pushes) setNearby(view);
        },
        () => undefined,
      );
    };
    ask();
    const renew = setInterval(ask, NEARBY_RENEW_MS);
    return () => {
      open = false;
      clearInterval(renew);
      setNearby(NEARBY_OFF);
      void window.infinitary.devices.nearby(false).catch(() => undefined);
    };
  }, [askingAddress, addsByAddress]);

  // The countdown ticks while a link is open; the seen times each minute.
  useEffect(() => {
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), panel?.state === "open" ? 1000 : 60_000);
    return () => clearInterval(tick);
  }, [panel]);

  const make = useCallback(
    async (what: DevicePanelMake, copy = false) => {
      setProblem(null);
      setBusy("link");
      try {
        // One link or command in the panel at a time: a new one closes the one it replaces.
        const open = usePanel.getState().panel;
        if (open?.state === "open") await window.infinitary.devices.stop(open.invite.id);
        const invite = await window.infinitary.devices.invite(
          what === "link" || what === "phone"
            ? { kind: "mac", ...(what === "phone" ? { phone: true } : {}) }
            : what === "command"
              ? { kind: "mac", command: "another-mac" }
              : { kind: "work", command: "another-user" },
        );
        if (copy) {
          try {
            await navigator.clipboard.writeText(invite.command?.text ?? invite.link);
          } catch {
            // The panel still holds it, so the person can copy it there.
          }
        }
        show(invite, what, copy);
      } catch (caught) {
        setProblem(caught instanceof Error ? caught.message : m.settingsDevicesMakeFailed());
      } finally {
        setBusy(null);
      }
    },
    [show],
  );

  const remove = useCallback(
    async (deviceId: string, when?: DeviceRemoveWhen) => {
      setProblem(null);
      setBusy("remove");
      setRemoving(null);
      try {
        await window.infinitary.devices.remove(deviceId, when);
      } catch (caught) {
        setProblem(caught instanceof Error ? caught.message : m.settingsDevicesRemoveFailed());
      } finally {
        setBusy(null);
        refresh();
      }
    },
    [refresh],
  );

  // Carry its tasks on (docs/devices.md, "Joined again"): the tasks that
  // stayed, if any, are said with why; the rows follow the rest.
  const carry = useCallback(
    async (from: string, to: string) => {
      setProblem(null);
      setBusy("carry");
      setCarrying(null);
      try {
        const answer = await window.infinitary.devices.carryOn(from, to);
        if (answer.stayed.length > 0) setProblem(answer.stayed.join("\n"));
      } catch (caught) {
        setProblem(caught instanceof Error ? caught.message : m.settingsDevicesCarryFailed());
      } finally {
        setBusy(null);
        refresh();
      }
    },
    [refresh],
  );

  // Adding a Mac by its address: the row follows each step. A refusal
  // keeps the address in the field and says its two lines in that aside.
  // Try again is the captain's own click. A Mac whose user runs another
  // Firstmate's work asks once; `leave` is the yes. A Mac that did not let
  // the captain's key in asks for that user's password, which goes on this
  // one call and is kept nowhere here.
  const addAt = useCallback(
    async (address: string, with_: AddWith = {}) => {
      const { leave, confirm, password } = with_;
      setProblem(null);
      setChanging(null);
      setLeaving(null);
      setConfirming(null);
      setPasswording(null);
      const setups = useSetups.getState();
      if (setups.adding.some((mac) => mac.address === address)) return;
      const mine = ++addressTry.current;
      setAddressRefusal(null);
      // The reaching row says a key is in use. It waits until the captain has
      // said this is the Mac, which is the call that carries `confirm`. The
      // call that carries the password is the one that lets Firstmate's key in.
      if (password) setups.addFrom(address, "letting-in");
      else if (confirm) setups.addFrom(address);
      try {
        const answer = await window.infinitary.devices.add(address, {
          ...(leave ? { leave: true as const } : {}),
          ...(confirm ? { confirm } : {}),
          ...(password ? { password } : {}),
        });
        if (mine !== addressTry.current) return;
        if ("asks" in answer && answer.asks === "confirm") {
          keepTyped(address);
          setAskingAddress(false);
          setConfirming(answer);
          return;
        }
        if ("asks" in answer && answer.asks === "password") {
          keepTyped(address);
          setAskingAddress(false);
          setPasswording(answer);
          return;
        }
        if ("asks" in answer) {
          setAskingAddress(false);
          setLeaving(answer);
          return;
        }
        setAskingAddress(false);
        setAddressDraft("");
        setPortDraft("");
        setAddressRefusal(null);
      } catch (caught) {
        if (mine !== addressTry.current) return;
        const message = caught instanceof Error ? caught.message : m.settingsDevicesAddFailed();
        const lines = remoteLoginRefusalLines(message);
        keepTyped(address);
        setAddressRefusal(lines.length > 0 ? lines : [m.settingsDevicesAddFailed()]);
        setAskingAddress(true);
      } finally {
        useSetups.getState().addDone(address);
      }
    },
    [keepTyped],
  );

  const update = useCallback(
    async (deviceId: string, options: RemoteLoginUpdateOptions = {}, worker?: DeviceView) => {
      setProblem(null);
      // Only the worker's package flow carries an address or a worker; an
      // ordinary update keeps its question in the aside.
      const workerFlow = options.address !== undefined || worker !== undefined;
      if (workerFlow) {
        setWorkerPasswording(null);
        setWorkerConfirming(null);
      } else setPasswording((asked) => (asked?.deviceId === deviceId ? null : asked));
      if (options.address) setWorkerAsking(false);
      const setups = useSetups.getState();
      if (setups.updating.includes(deviceId)) return;
      const mine = workerFlow ? ++workerTry.current : undefined;
      if (worker) {
        setSelected(deviceId);
        setPackageUpdate(worker);
        setLeaving(null);
        setWorkerAsking(false);
      }
      setups.updateFrom(deviceId);
      try {
        const answer = await window.infinitary.devices.update(deviceId, options);
        if (mine !== undefined && mine !== workerTry.current) return;
        if ("refused" in answer) {
          // An install or restart that may already have run keeps its warning,
          // with no form to try again.
          if (options.address && !answer.uncertain) {
            keepWorkerTyped(options.address);
            setWorkerRefusal(answer.lines);
            setWorkerAsking(true);
          } else {
            if (workerFlow) setPackageUpdate(null);
            refused(deviceId, answer);
          }
          return;
        }
        if ("asks" in answer && answer.asks === "package-address" && worker) {
          setLeaving(null);
          setWorkerConfirming(null);
          setWorkerPasswording(null);
          setWorkerRefusal(answer.lines?.length ? answer.lines : null);
          keepWorkerTyped(answer.address ?? "");
          setPackageUpdate(worker);
          setWorkerAsking(true);
          return;
        }
        if ("asks" in answer && answer.asks === "confirm") {
          if (worker) {
            setPackageUpdate(worker);
            setWorkerAsking(false);
          }
          if (workerFlow) {
            keepWorkerTyped(answer.address);
            setWorkerConfirming(answer);
          } else {
            keepTyped(answer.address);
            setConfirming(answer);
          }
          return;
        }
        if ("asks" in answer && answer.asks === "password") {
          if (worker) {
            setPackageUpdate(worker);
            setWorkerAsking(false);
          }
          if (workerFlow) setWorkerPasswording(answer);
          else setPasswording(answer);
          return;
        }
        if (options.address || worker) setPackageUpdate(null);
      } catch (caught) {
        if (mine !== undefined && mine !== workerTry.current) return;
        const words = caught instanceof Error ? caught.message : m.settingsDevicesUpdateFailed();
        if (options.address) {
          keepWorkerTyped(options.address);
          setWorkerRefusal([words]);
          setWorkerAsking(true);
        } else {
          if (worker) setPackageUpdate(null);
          setProblem(words);
        }
      } finally {
        useSetups.getState().updateDone(deviceId);
      }
    },
    [keepTyped, keepWorkerTyped, refused, setPackageUpdate],
  );

  // Try again: this Mac's own SSH connection to it, tried once now.
  const tryAgain = useCallback(async (deviceId: string) => {
    setProblem(null);
    try {
      await window.infinitary.devices.tryAgain(deviceId);
    } catch (caught) {
      setProblem(caught instanceof Error ? caught.message : m.settingsDevicesTryAgainFailed());
    }
  }, []);
  /** + A computer: its address form, empty, with the caret in the field (captain's pick on INF-4926). */
  const openAddressForm = useCallback(() => {
    addressTry.current += 1;
    setAddressRefusal(null);
    setLeaving(null);
    setConfirming(null);
    setPasswording(null);
    cancelWorkerUpdate();
    setAddressDraft("");
    setPortDraft("");
    setAskingAddress(true);
  }, [cancelWorkerUpdate]);

  // Fix it: the Mac's window checks its work again, and its row says what it found.
  const fixWork = useCallback(async (deviceId: string) => {
    setProblem(null);
    try {
      await window.infinitary.devices.fixWork(deviceId);
    } catch (caught) {
      setProblem(caught instanceof Error ? caught.message : m.settingsDevicesTryAgainFailed());
    }
  }, []);

  // Update app: the app open there gets this computer's version, and its row says each step.
  const updateApp = useCallback(async (deviceId: string) => {
    setProblem(null);
    try {
      await window.infinitary.devices.updateApp(deviceId);
    } catch (caught) {
      setProblem(caught instanceof Error ? caught.message : m.settingsDevicesTryAgainFailed());
    }
  }, []);

  // Update later: the update waiting on its crew's work goes, and the list says so once it has.
  const updateLater = useCallback(
    async (deviceId: string) => {
      setProblem(null);
      try {
        await window.infinitary.devices.updateLater(deviceId);
      } catch (caught) {
        setProblem(caught instanceof Error ? caught.message : m.devicesUpdateLaterFailed());
      } finally {
        refresh();
      }
    },
    [refresh],
  );

  // Change address: its row says where this Mac looks; a refusal is said here too.
  const changeAddress = useCallback(
    async (deviceId: string, address: string) => {
      setProblem(null);
      setChanging(null);
      const setups = useSetups.getState();
      if (setups.moving.some((each) => each.deviceId === deviceId)) return;
      setups.moveFrom({ deviceId, address });
      try {
        const answer = await window.infinitary.devices.changeAddress(deviceId, address);
        if ("refused" in answer) refused(deviceId, answer, address);
      } catch (caught) {
        setProblem(
          caught instanceof Error ? caught.message : m.settingsDevicesChangeAddressFailed(),
        );
      } finally {
        useSetups.getState().moveDone(deviceId);
      }
    },
    [refused],
  );

  const keep = useCallback(
    async (deviceId: string) => {
      setProblem(null);
      try {
        await window.infinitary.devices.keep(deviceId);
      } catch (caught) {
        setProblem(caught instanceof Error ? caught.message : m.settingsDevicesKeepFailed());
      } finally {
        refresh();
      }
    },
    [refresh],
  );

  const beginUpdate = useCallback(
    (device: DeviceView) => {
      // Another user here already runs this computer’s installed app.
      const runsThisApp = device.onThisMac === true && device.user !== undefined;
      if (device.otherVersion?.updateBy === "command")
        void make(runsThisApp ? "user-command" : "command");
      else if (
        canUpdateByPackageAddress &&
        device.system === "linux" &&
        !device.remoteLogin &&
        !runsThisApp
      )
        void update(device.id, { packageFallback: true }, device);
      else void update(device.id);
    },
    [canUpdateByPackageAddress, make, update],
  );

  // A card's button lands here with what to do: make a link or a command,
  // add a Mac at an address, update Firstmate on one, or remove a device.
  // The click was the captain's own; this only carries it out - but a
  // computer out of reach asks how first.
  useEffect(() => {
    if (!arrival || packageUpdate || packageUpdateOwner.current) return;
    let active = true;
    // Consume only this arrival, and only when its action can run.
    const takeArrival = () => {
      const shell = useShellStore.getState();
      if (!active || packageUpdateOwner.current || shell.pendingDeviceArrival !== arrival)
        return false;
      shell.clearPendingDeviceArrival();
      return true;
    };
    if ("make" in arrival) {
      if (takeArrival()) void make(arrival.make);
      return;
    }
    if ("add" in arrival) {
      if (takeArrival()) void addAt(arrival.add);
      return;
    }
    if ("addressForm" in arrival) {
      if (takeArrival()) openAddressForm();
      return;
    }
    if ("update" in arrival) {
      void window.infinitary.devices.list().then(
        (listed) => {
          if (!takeArrival()) return;
          setSelected(arrival.update);
          const worker = listed.find((device) => device.id === arrival.update);
          if (worker) beginUpdate(worker);
          else void update(arrival.update);
        },
        () => {
          if (!takeArrival()) return;
          setSelected(arrival.update);
          void update(arrival.update);
        },
      );
    } else {
      const gone = arrival.remove;
      void window.infinitary.devices.list().then(
        (listed) => {
          if (!takeArrival()) return;
          updateDevices(listed);
          const device = listed.find((entry) => entry.id === gone);
          setSelected(device?.id ?? null);
          if (device && deviceRunsWork(device.kind) && !device.inReach) setRemoving(device.id);
          else void remove(gone);
        },
        () => {
          takeArrival();
        },
      );
    }
    return () => {
      active = false;
    };
  }, [
    arrival,
    make,
    remove,
    addAt,
    openAddressForm,
    beginUpdate,
    update,
    updateDevices,
    packageUpdate,
  ]);

  // A computer a card or a panel named (`settingsItem`): its row is chosen,
  // and every control there stays the captain's own.
  const itemArrival = useShellStore((s) =>
    s.settingsItem?.section === "devices" ? s.settingsItem.item : null,
  );
  useEffect(() => {
    if (itemArrival === null || devices.length === 0) return;
    useShellStore.getState().clearSettingsItem();
    if (devices.some((device) => device.id === itemArrival)) setSelected(itemArrival);
  }, [itemArrival, devices]);

  const stop = async () => {
    const open = usePanel.getState().panel;
    clear();
    if (open?.state === "open")
      await window.infinitary.devices.stop(open.invite.id).catch(() => {});
  };

  // A link past its thirty minutes reads as expired, whether or not the tab
  // was open when it ran out.
  const shown: LinkPanel | null =
    panel?.state === "open" && panel.invite.expiresAt <= now
      ? { state: "expired", make: panel.make }
      : panel;

  return (
    <DevicesTabView
      selection={selected}
      onSelect={setSelected}
      devices={devices}
      signIns={signIns}
      addresses={addresses}
      panel={shown}
      now={now}
      removing={removing}
      carrying={carrying}
      changing={changing}
      moving={moving}
      askingAddress={askingAddress}
      packageUpdate={packageUpdate ?? undefined}
      nearby={nearby}
      confirming={confirming}
      passwording={passwording}
      workerConfirming={workerConfirming}
      workerPasswording={workerPasswording}
      workerAskingAddress={workerAsking}
      workerAddressDraft={workerDraft}
      workerPortDraft={workerPort}
      workerAddressRefusal={workerRefusal}
      onWorkerAddressDraft={setWorkerDraft}
      onWorkerPortDraft={setWorkerPort}
      onCancelWorkerUpdate={cancelWorkerUpdate}
      leaving={leaving}
      adding={adding}
      updating={updating}
      updateCopy={updateCopy}
      busy={busy}
      problem={problem}
      onAddMac={openAddressForm}
      addressDraft={addressDraft}
      portDraft={portDraft}
      addressRefusal={addressRefusal}
      onAddressDraft={setAddressDraft}
      onPortDraft={setPortDraft}
      onCancelAddress={cancelAddress}
      onAddAt={(address) => {
        if (packageUpdate) void update(packageUpdate.id, { address });
        else void addAt(address);
      }}
      onConfirm={(question) => {
        // Each reply goes to the flow that asked it.
        if (packageUpdate && question === workerConfirming)
          void update(packageUpdate.id, { address: question.address, confirm: question.line });
        else void addAt(question.address, { confirm: question.line });
      }}
      onCancelConfirm={() => {
        addressTry.current += 1;
        setConfirming(null);
        setAskingAddress(true);
      }}
      onPassword={(question, password) => {
        if (packageUpdate && question === workerPasswording)
          void update(packageUpdate.id, { password, address: question.address });
        else if (question.for === "update" && question.deviceId)
          void update(question.deviceId, { password });
        else void addAt(question.address, { password });
      }}
      onCancelPassword={() => {
        addressTry.current += 1;
        const updating = passwording?.for === "update";
        setPasswording(null);
        if (!updating && !packageUpdate) setAskingAddress(true);
      }}
      onLeaveAndAdd={(address) => void addAt(address, { leave: true })}
      onCancelLeave={() => setLeaving(null)}
      onMake={(what) => void make(what)}
      onStop={() => void stop()}
      onDone={clear}
      onAskRemove={setRemoving}
      onUpdate={beginUpdate}
      onRemove={(id, when) => void remove(id, when)}
      onKeep={(id) => void keep(id)}
      onAskCarry={setCarrying}
      onCarry={(from, to) => void carry(from, to)}
      onTryAgain={(id) => void tryAgain(id)}
      onFixWork={(id) => void fixWork(id)}
      onUpdateApp={(id) => void updateApp(id)}
      onUpdateLater={(id) => void updateLater(id)}
      onAskChangeAddress={setChanging}
      onChangeAddress={(id, address) => void changeAddress(id, address)}
      onCopyWay={(what) => void make(what, true)}
    />
  );
}

export function DevicesTabView(
  props: DevicesTabViewProps & {
    selection?: string | null;
    onSelect?: (id: string | null) => void;
  },
) {
  const { devices, addresses, busy, problem } = props;
  const firewall = homeFirewallOf(addresses);
  const here = useHereAs();
  const fromAView = useShellStore((s) => isView(s.thisMac));
  const homeMove = useHomeMove(devices);
  const standbyViews = useStandbyViews();
  const standbys = new Map(standbyViews.standbys.map((view) => [view.deviceId, view]));
  const [standbyAsking, setStandbyAsking] = useState<string | null>(null);
  useEffect(() => {
    setStandbyAsking((id) => (devices.some((device) => device.id === id) ? id : null));
  }, [devices]);
  const [standbyProblem, setStandbyProblem] = useState<string | null>(null);
  const home = here(HERE.This);
  const localUsers = devices.filter((device) => deviceRunsWork(device.kind) && device.onThisMac);
  const peers = devices.filter((device) => !localUsers.includes(device));
  const changing = devices.find(
    (device) => device.id === props.changing && canEditAddress(device),
  )?.id;
  // A question can hold selection only while its inspector can still render it.
  const packageOwner = devices.find((device) => device.id === props.packageUpdate?.id)?.id;
  const cancelWorker = () => props.onCancelWorkerUpdate?.();
  const carryRow = props.carrying?.row;
  const question = [
    packageOwner,
    props.removing,
    carryRow,
    changing,
    standbyAsking,
    homeMove.asking,
  ].find((id) => devices.some((device) => device.id === id));
  const selected = devices.find((device) => device.id === (question ?? props.selection));
  const selectedPeer = selected && !localUsers.includes(selected) ? selected : null;
  const inspector = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const select = (id: string | null) => {
    // Keep an open question and its side effects owned by the same inspector.
    if (
      (question || inspector.current?.querySelector('[data-secret-question="device"]')) &&
      id !== (selectedPeer?.id ?? null)
    )
      return;
    props.onSelect?.(id);
  };
  useEffect(() => {
    if (!question && trigger.current) {
      const source = trigger.current;
      trigger.current = null;
      const replacement = source.isConnected
        ? source
        : Array.from(inspector.current?.querySelectorAll<HTMLElement>("button") ?? []).find(
            (button) =>
              button.getAttribute("aria-label") === source.getAttribute("aria-label") &&
              button.textContent === source.textContent,
          );
      replacement?.focus();
    }
  }, [question]);
  const ask =
    <T,>(open: (id: T | null) => void) =>
    (id: T | null) => {
      if (id && packageOwner) return;
      if (
        id &&
        document.activeElement instanceof HTMLElement &&
        inspector.current?.contains(document.activeElement)
      )
        trigger.current = document.activeElement;
      open(id);
    };
  const keepCopy = (deviceId: string) => {
    setStandbyProblem(null);
    void window.infinitary.devices.standby
      .name(deviceId, true)
      .then((answer) => {
        if (!answer.ok) setStandbyProblem(answer.text);
      })
      .catch(() => {});
  };
  return (
    <div data-devices="">
      <LinkPanelView {...props} />
      {(problem ?? standbyProblem) && (
        <div style={{ marginBottom: 16 }}>
          <SettingError error={here(problem ?? standbyProblem ?? "")} surface="devices" />
        </div>
      )}
      {!fromAView && standbyViews.twoHomes && <KeepHomeQuestion other={standbyViews.twoHomes} />}
      <SectionLabel>{m.settingsDevicesLabel()}</SectionLabel>
      <div className="fm-devices-say" data-devices-intro="">
        {here(devicesIntro(fromAView))}
      </div>
      <DeviceTopology
        home={home}
        peers={peers}
        selected={selectedPeer?.id ?? null}
        progressFor={(device) => {
          const adding = props.adding.find((each) => each.deviceId === device.id);
          const download = (adding?.copy ?? props.updateCopy?.[device.id])?.download;
          if (download?.total && download.total > 0)
            return m.settingsDevicesMapDownloading({
              percent: formatNumber(Math.min(1, download.received / download.total), {
                style: "percent",
              }),
            });
          if (props.updating.includes(device.id)) return m.settingsDevicesMapUpdating();
          if (
            adding ||
            props.moving.some((each) => each.deviceId === device.id) ||
            device.workSetup?.state === "starting"
          )
            return m.settingsDevicesSettingUp();
          return null;
        }}
        onSelect={select}
      />
      <div className="fm-devices-box" data-devices-list="" style={{ marginBottom: SECTION_GAP }}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: Escape bubbles from the inspector controls. */}
        <div
          ref={inspector}
          data-device-inspector=""
          onKeyDown={(event) => {
            if (event.key !== "Escape" || (question === homeMove.asking && homeMove.progress))
              return;
            // A row's ⋯ menu owns its own Escape: it closes the menu, never the question beside it.
            const from = event.target as HTMLElement;
            if (from.closest('[role="menu"]') || from.getAttribute("aria-expanded") === "true")
              return;
            const approval = inspector.current?.querySelector<HTMLButtonElement>(
              '[data-secret-question="device"] button',
            );
            if (question === packageOwner && packageOwner) {
              if (!props.workerAskingAddress && !props.workerConfirming && !props.workerPasswording)
                return;
              event.stopPropagation();
              props.onCancelWorkerUpdate?.();
              return;
            }
            if (!question && !approval) return;
            event.stopPropagation();
            if (approval) {
              approval.click();
              return;
            }
            if (question === props.removing) props.onAskRemove(null);
            else if (question === carryRow) props.onAskCarry?.(null);
            else if (question === changing) props.onAskChangeAddress(null);
            else if (question === standbyAsking) setStandbyAsking(null);
            else homeMove.ask(null);
          }}
        >
          {!selectedPeer && (
            <>
              <div className="fm-devices-row" data-device-row="this-mac">
                <span className="fm-devices-dot" data-tone="ok" />
                <span className="fm-devices-text">
                  <span className="fm-devices-name">{home}</span>
                  <span className="fm-devices-detail">
                    {fromAView ? m.settingsDevicesLivesThere() : m.settingsDevicesLivesHere()}
                  </span>
                </span>
              </div>
              <WaysSection {...props} />
              {firewall && !panelForAnotherComputer(props.panel) && (
                <FirewallLine firewall={firewall} under="address" />
              )}
              {localUsers.length > 0 && (
                <div className="fm-devices-local-users">{m.settingsDevicesLocalUsers()}</div>
              )}
            </>
          )}
          {(selectedPeer ? [selectedPeer] : localUsers).map((device) => (
            <Fragment key={device.id}>
              {props.removing === device.id ? (
                <RemoveQuestion device={device} {...props} />
              ) : props.carrying && carryRow === device.id ? (
                <CarryQuestion {...props} ask={props.carrying} />
              ) : changing === device.id ? (
                <AddressChange device={device} {...props} />
              ) : (
                <>
                  <DeviceRow
                    {...props}
                    device={device}
                    busy={packageOwner ? "link" : props.busy}
                    onAskRemove={ask(props.onAskRemove)}
                    onAskCarry={props.onAskCarry ? ask(props.onAskCarry) : undefined}
                    onAskChangeAddress={ask(props.onAskChangeAddress)}
                    onAskMoveHome={fromAView ? undefined : ask(homeMove.ask)}
                    standby={standbys.get(device.id)}
                    onKeepCopy={fromAView ? undefined : keepCopy}
                    onAskStandbyReady={fromAView ? undefined : ask(setStandbyAsking)}
                  />
                  {props.packageUpdate?.id === device.id &&
                    (props.workerAskingAddress ||
                      props.workerConfirming ||
                      props.workerPasswording) && (
                      <div className="fm-devices-worker-update" data-worker-update={device.id}>
                        {props.workerAskingAddress && (
                          <AddressQuestion
                            {...props}
                            addressDraft={props.workerAddressDraft ?? ""}
                            portDraft={props.workerPortDraft ?? ""}
                            addressRefusal={props.workerAddressRefusal ?? null}
                            onAddressDraft={props.onWorkerAddressDraft ?? (() => undefined)}
                            onPortDraft={props.onWorkerPortDraft ?? (() => undefined)}
                            onCancelAddress={cancelWorker}
                          />
                        )}
                        {props.workerConfirming && (
                          <ConfirmQuestion
                            {...props}
                            question={props.workerConfirming}
                            onCancelConfirm={cancelWorker}
                          />
                        )}
                        {props.workerPasswording && (
                          <PasswordQuestion
                            {...props}
                            question={props.workerPasswording}
                            onCancelPassword={cancelWorker}
                          />
                        )}
                      </div>
                    )}
                  {standbyAsking === device.id && (
                    <StandbyQuestion
                      device={device}
                      view={standbys.get(device.id)}
                      onClose={() => setStandbyAsking(null)}
                    />
                  )}
                  {homeMove.asking === device.id && (
                    <HomeMoveQuestion
                      device={device}
                      progress={homeMove.progress}
                      onClose={() => homeMove.ask(null)}
                    />
                  )}
                </>
              )}
              {selectedPeer && !fromAView && standbys.has(device.id) && (
                <TakeoverAddresses key={device.id} deviceId={device.id} observed={standbyViews} />
              )}
            </Fragment>
          ))}
        </div>
        {peers
          .filter(
            (device) =>
              device.id !== selectedPeer?.id &&
              (props.adding.some((mac) => mac.deviceId === device.id) ||
                props.updating.includes(device.id) ||
                props.moving.some((mac) => mac.deviceId === device.id) ||
                device.removal === "bringing-work" ||
                device.removal === "cleaning-up"),
          )
          .map((device) => (
            <button
              type="button"
              className="fm-device-progress-link"
              key={device.id}
              onClick={() => select(device.id)}
            >
              {deviceLabel(device)} · {m.settingsDevicesShowProgress()}
            </button>
          ))}
        {props.adding
          .filter((mac) => !devices.some((device) => device.id === mac.deviceId))
          .map((mac) => (
            <AddingRow key={mac.address} mac={mac} />
          ))}
        <div className="fm-devices-foot">
          <span className="fm-devices-foot-label">{m.settingsDevicesAdd()}</span>
          <button
            type="button"
            className="fm-connect-chip"
            data-device-add="mac"
            aria-expanded={props.askingAddress && !props.packageUpdate}
            disabled={busy === "link" || !!packageOwner}
            onClick={props.onAddMac}
          >
            {plusIcon}
            <span>{m.settingsDevicesAddComputer()}</span>
          </button>
          <button
            type="button"
            className="fm-connect-chip"
            data-device-add="phone"
            disabled={busy === "link" || !!packageOwner}
            onClick={() => props.onMake("phone")}
          >
            {plusIcon}
            <span>{m.settingsDevicesAddPhone()}</span>
          </button>
          <button
            type="button"
            className="fm-connect-chip"
            data-device-add="user"
            disabled={busy === "link" || !!packageOwner}
            onClick={() => props.onMake("user-command")}
          >
            {plusIcon}
            <span>{m.settingsDevicesAddUser()}</span>
          </button>
        </div>
        {props.askingAddress && !props.packageUpdate && <AddressQuestion {...props} />}
        {props.confirming && <ConfirmQuestion question={props.confirming} {...props} />}
        {props.passwording && <PasswordQuestion question={props.passwording} {...props} />}
        {props.leaving && <LeaveQuestion question={props.leaving} {...props} />}
      </div>
    </div>
  );
}

/**
 * What Your devices says first. On a computer that controls the first mate,
 * "here" would name the wrong computer, so it names that one instead.
 */
function devicesIntro(fromAView: boolean): string {
  // A computer that controls the first mate does not know that computer's
  // system, so it says the sentence that holds on each.
  const reads = fromAView
    ? anotherUserHere("linux").reads
    : anotherUserHere(thisDesktop().mac ? "darwin" : thisDesktop().windows ? "win32" : "linux")
        .readsHere;
  return fromAView ? m.settingsDevicesIntroThere({ reads }) : m.settingsDevicesIntroHere({ reads });
}
