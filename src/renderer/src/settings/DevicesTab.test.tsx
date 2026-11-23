import {
  type DeviceAddresses,
  type DeviceView,
  deviceJoinedLine,
  deviceLabel,
  deviceWords,
} from "@shared/devices";
import { feedLineFrom } from "@shared/feed";
import * as m from "@shared/i18n/messages.generated";
import { NEARBY_OFF, type NearbyMacsView, nearbyMacsWords } from "@shared/nearbyMacs";
import { type RemoteLoginRefusedAnswer, remoteLoginWords } from "@shared/remoteLogin";
import type { DeviceSignIns } from "@shared/signIns";
import { sshConnectionWords } from "@shared/sshConnection";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { nearbyStep } from "../devices/NearbyList";
import { DevicesTabView } from "./DevicesTab";
import {
  type DevicesTabViewProps,
  joinedNoticeClears,
  reachRefusalAfter,
  reachRefusalOf,
} from "./devicesState";
import {
  DEVICE_ROW_WORDS,
  deviceIdentity,
  deviceState,
  deviceStatus,
  deviceSummary,
  heldLine,
  joinedWhen,
  linkTimeLeft,
  removeLines,
  sshStoppedLine,
  strandedLine,
  wayBack,
  workSetupLine,
} from "./devicesWords";

/**
 * Settings -> Devices as the captain reads it (design skill
 * components/devices/DevicesTab): this Mac first, then each Mac added with
 * Remove, the link panel's three states, and where devices find this Mac.
 */

const NOW = new Date(2026, 9, 3, 15, 20, 0).getTime();
/** A Mac that controls this Firstmate, open on it now. */
const AIR: DeviceView = {
  id: "air",
  kind: "view",
  name: "MacBook Air",
  pairedAt: new Date(2026, 9, 3, 14, 6).getTime(),
  inReach: true,
  seenAt: new Date(2026, 9, 3, 14, 6).getTime(),
  controlling: true,
};
const LINK = `infinitary://join?as=view&at=192.168.1.20%3A47623&key=${"K".repeat(43)}&code=${"C".repeat(43)}`;
/** Another user on this Mac that runs work, in reach, running one task of website. */
const BUILDER: DeviceView = {
  id: "builder",
  kind: "work",
  name: "MacBook Pro",
  pairedAt: new Date(2026, 9, 3, 14, 6).getTime(),
  user: "builder",
  onThisMac: true,
  inReach: true,
  tasks: 1,
  runs: ["website"],
};
/** Another Mac that runs work, out of reach since 14:02, running website and api. */
const MINI: DeviceView = {
  id: "mini",
  kind: "work",
  name: "Mac mini",
  pairedAt: new Date(2026, 9, 3, 11, 30).getTime(),
  user: "sam",
  onThisMac: false,
  inReach: false,
  seenAt: new Date(2026, 9, 3, 14, 2).getTime(),
  tasks: 0,
  runs: ["website", "api"],
};
const time = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const noop = () => {};

/**
 * What a device's ⋯ menu offers, in its order, as its row lists it
 * (`data-device-acts`); the menu itself draws its items only once opened.
 * Without an id, the first row's; no row, nothing.
 */
function acts(html: string, id?: string): string[] {
  const row = id ? `data-device-row="${id}"[^>]*?` : "";
  const found = new RegExp(`${row}data-device-acts="([^"]*)"`).exec(html)?.[1];
  return found ? found.split(" ") : [];
}

/** A device's mono line and its head's status, as the row draws them. */
function lines(device: DeviceView) {
  return { identity: deviceIdentity(device, NOW), status: deviceStatus(device, NOW).text };
}

/** The words a row shows, without the parts the detail line is drawn in. */
function words(html: string) {
  return html.replace(/<[^>]*>/g, "");
}

function render(overrides: Partial<DevicesTabViewProps> & { selection?: string | null } = {}) {
  return renderToStaticMarkup(
    <DevicesTabView
      selection={(overrides.devices ?? [AIR])[0]?.id ?? null}
      devices={[AIR]}
      addresses={{
        addresses: [{ address: "192.168.1.20", network: "local" }],
        chosen: null,
        current: "192.168.1.20",
      }}
      signIns={[]}
      panel={null}
      now={NOW}
      removing={null}
      changing={null}
      moving={[]}
      askingAddress={false}
      nearby={NEARBY_OFF}
      confirming={null}
      passwording={null}
      addressDraft=""
      portDraft=""
      addressRefusal={null}
      onAddressDraft={noop}
      onPortDraft={noop}
      leaving={null}
      adding={[]}
      updating={[]}
      busy={null}
      problem={null}
      onAddMac={noop}
      onCancelAddress={noop}
      onAddAt={noop}
      onConfirm={noop}
      onCancelConfirm={noop}
      onPassword={noop}
      onCancelPassword={noop}
      onLeaveAndAdd={noop}
      onCancelLeave={noop}
      onMake={noop}
      onStop={noop}
      onDone={noop}
      onAskRemove={noop}
      onUpdate={noop}
      onRemove={noop}
      onKeep={noop}
      onTryAgain={noop}
      onFixWork={noop}
      onAskChangeAddress={noop}
      onChangeAddress={noop}
      onCopyWay={noop}
      {...overrides}
    />,
  );
}

describe("Settings -> Devices", () => {
  it("lists this Mac first with no Remove, then each Mac by its own name with Remove", () => {
    const html = render();
    expect(render({ selection: null }).indexOf("This computer")).toBeLessThan(
      render({ selection: null }).indexOf("MacBook Air"),
    );
    expect(render({ selection: null })).toContain("Your first mate lives here");
    expect(words(html)).toContain(
      `a computer · joined today ${new Date(AIR.pairedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    );
    // Remove waits alone in the row's ⋯ menu, named for the computer.
    expect(acts(html)).toEqual(["remove"]);
    expect(html).toContain('aria-label="MacBook Air actions"');
    expect(html).toContain("A computer");
    expect(html).toContain("Running as another user");
    expect(html).not.toContain("data-panel-state");
    expect(html).not.toContain("data-device-chooser");
  });

  // INF-416 L: every build offers a phone; no capability flag remains.
  it("offers a computer, another user, and a phone", () => {
    const offered = render();
    for (const kind of ["mac", "user", "phone"])
      expect(offered).toContain(`data-device-add="${kind}"`);
    expect(offered).toContain("A phone");
  });

  // INF-1456, the captain's answer: each computer's row names its chip, "one
  // word on the computer's row, from what it already said at pairing".
  it("names each device by what it said it is: a Mac or a Linux computer is a computer with its chip, a phone a phone", () => {
    const joined = `joined today ${time(AIR.pairedAt)}`;
    expect(deviceIdentity({ ...AIR, system: "macos", chip: "arm64" }, NOW)).toBe(
      `a computer · Apple silicon · ${joined}`,
    );
    expect(deviceIdentity({ ...AIR, system: "macos", chip: "x64" }, NOW)).toBe(
      `a computer · Intel · ${joined}`,
    );
    expect(deviceIdentity({ ...AIR, system: "linux", chip: "x64" }, NOW)).toBe(
      `a computer · Intel or AMD · ${joined}`,
    );
    expect(deviceIdentity({ ...AIR, system: "ios" }, NOW)).toBe(`a phone · ${joined}`);
    expect(deviceIdentity(AIR, NOW)).toBe(`a computer · ${joined}`);
    const html = render({ devices: [{ ...AIR, id: "pocket", name: "Pocket", system: "ios" }] });
    expect(words(html)).toContain("a phone · joined today");
    expect(acts(html)).toContain("remove");
  });

  it("says beside the way to add one that running as another user can read your home folder's files", () => {
    // macOS opens every home folder to every user on the Mac (FI3-862).
    expect(render()).toContain(
      "Running as another user on this computer runs work, and your first mate can move there. Like every user here, it can read files in your home folder.",
    );
  });

  it("says a Mac that controls this Firstmate is seen and controlling it now, and since when it is out of reach", () => {
    const html = render();
    expect(lines(AIR)).toEqual({
      identity: `a computer · joined today ${time(AIR.pairedAt)}`,
      status: "seen just now",
    });
    expect(words(html)).toContain(`a computer · joined today ${time(AIR.pairedAt)}`);
    expect(html).toContain(">seen just now<");
    expect(html).toContain("Controlling your first mate now");
    expect(html).toMatch(
      /data-device-row="air" data-controlling=""[^>]*><div class="fm-devices-head"><span class="fm-devices-dot" data-device-dot="" data-tone="ok">/,
    );

    // Firstmate quit there at 15:02: out of reach since then, and no longer controlling.
    const gone = {
      ...AIR,
      inReach: false,
      controlling: false,
      seenAt: new Date(2026, 9, 3, 15, 2).getTime(),
    };
    const away = render({ devices: [gone] });
    expect(lines(gone)).toEqual({
      identity: `a computer · joined today ${time(AIR.pairedAt)}`,
      status: `out of reach since ${time(gone.seenAt)}`,
    });
    expect(away).toContain(`>out of reach since ${time(gone.seenAt)}<`);
    expect(away).not.toContain("Controlling your first mate now");
    expect(away).toMatch(
      /data-device-row="air"[^>]*><div class="fm-devices-head"><span class="fm-devices-dot" data-device-dot="" data-tone="warn">/,
    );
    expect(acts(away)).toContain("remove");

    // Never seen since this Mac kept the time: only that it is out of reach.
    const { seenAt: _never, ...unseen } = gone;
    expect(lines(unseen).status).toBe("out of reach");
    expect(deviceSummary(gone, undefined)).toBe("");
  });

  // INF-4260 piece 10: a Windows PC that joined from its window runs work as a Mac does.
  it("reads a Windows PC that joined from its window as it reads a Mac that runs work", () => {
    const pc: DeviceView = {
      ...MINI,
      id: "pc",
      kind: "mac",
      name: "DESKTOP-7QK2M1",
      system: "windows",
      inReach: true,
      controlling: true,
      seenAt: NOW,
    };
    expect(deviceSummary(pc, undefined)).toBe(deviceSummary({ ...pc, system: "macos" }, undefined));
    expect(deviceSummary(pc, undefined)).toBe(
      `${DEVICE_ROW_WORDS.controllingNow} · Runs website and api`,
    );
  });

  it("says a Mac that both controls and runs work is controlling now before what it runs, on one row", () => {
    const imac: DeviceView = {
      ...MINI,
      id: "imac",
      kind: "mac",
      name: "iMac",
      inReach: true,
      controlling: true,
      seenAt: NOW,
    };
    expect(deviceSummary(imac, undefined)).toBe(
      "Controlling your first mate now · Runs website and api",
    );
    expect(deviceSummary({ ...imac, controlling: false, runs: [] }, undefined)).toBe(
      "Runs no project yet",
    );
    const html = render({ devices: [imac] });
    expect(html).toMatch(/data-device-row="imac" data-controlling=""/);
    expect(acts(html)).toContain("remove");
    // The address way says why it is the default: this computer keeps the other one up to date.
    expect(render({ askingAddress: true })).toContain(m.settingsDevicesAddressKeeps());
  });

  it("draws a device's name as text, never as markup", () => {
    const html = render({ devices: [{ ...AIR, name: "<b>Air</b>" }] });
    expect(html).toContain("&lt;b&gt;Air&lt;/b&gt;");
    expect(html).not.toContain("<b>Air</b>");
  });

  it("asks once in place before removing, with Keep it first", () => {
    const html = render({ removing: "air" });
    expect(html).toContain("Remove MacBook Air? It is cut off at once.");
    expect(html).toContain("To come back, it needs a new link.");
    expect(html.indexOf("Keep it")).toBeLessThan(html.lastIndexOf(">Remove<"));
  });

  it("shows an open link with its count and Stop it, then joined or expired", () => {
    const open = render({
      panel: {
        state: "open",
        invite: { id: "l1", link: LINK, kind: "view", expiresAt: NOW + 581_000 },
        make: "link",
      },
    });
    expect(open).toContain('data-panel-state="open"');
    expect(open).toContain(LINK.replace(/&/g, "&amp;"));
    expect(open).toContain("Copy link");
    expect(open).toContain("works once · 9:41 left");
    expect(open).toContain("Stop it");

    const joined = render({
      panel: {
        state: "joined",
        line: deviceJoinedLine({ name: "iMac", kind: "view" }),
        work: false,
      },
    });
    expect(joined).toContain(
      "iMac joined. It can control your first mate. Your first mate&#x27;s tasks and conversation stay on this computer.",
    );
    expect(joined).toContain("Done");
    expect(joined).not.toContain("infinitary://");
    expect(joined).not.toContain("Give it a project");

    const expired = render({ panel: { state: "expired", make: "link" } });
    expect(expired).toContain("The link expired before any computer used it.");
    expect(expired).toContain("Make a new one");
  });

  // INF-4926's plan, the captain's lead = address-form-first: "+ A computer opens the address
  // form", with the link and the command under "Can't turn on Remote Login there?".
  it("opens the address form with the link and the command under it, and when to use each", () => {
    const html = render({ askingAddress: true });
    expect(html).not.toContain("data-device-chooser");
    const ways = html.slice(html.indexOf("data-device-other-ways"));
    expect(html.indexOf("data-device-address-question")).toBeLessThan(
      html.indexOf("data-device-other-ways"),
    );
    // The words as the page escapes them, read from a lone span's markup.
    for (const words of [
      m.settingsDevicesAddOtherWays(),
      m.settingsDevicesAddByLink(),
      m.settingsDevicesAddByLinkWhen(),
      m.settingsDevicesAddByCommand(),
      m.settingsDevicesAddByCommandWhen(),
    ])
      expect(ways).toContain(renderToStaticMarkup(<span>{words}</span>).slice(6, -7));
    // A package update keeps its own words, with no other ways.
    expect(
      render({ askingAddress: true, packageUpdate: { ...AIR, kind: "mac", name: "Ubuntu" } }),
    ).not.toContain("data-device-other-ways");
  });

  it("asks for the other Mac's address, the one the captain uses with SSH", () => {
    const html = render({ askingAddress: true });
    expect(html).toContain("data-device-address-question");
    expect(html).not.toContain("data-device-chooser");
    expect(html).toContain("The other computer&#x27;s address");
    expect(html).toContain("The one you use with SSH. Remote Login must be on there.");
    expect(html).toContain('placeholder="you@mini.local"');
    // Nothing typed yet: Add it waits for an address.
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Add it<\/button>/);
  });

  it("lists Macs nearby under the field with your user name, marking one already added", () => {
    const nearby: NearbyMacsView = {
      state: "looking",
      user: "kun",
      macs: [
        { name: "Studio", at: "Studio.local" },
        { name: "Mac mini", at: "Kuns-Mac-mini.local" },
      ],
    };
    const html = render({
      askingAddress: true,
      nearby,
      devices: [{ ...MINI, remoteLogin: "sam@kuns-mac-mini.local" }],
    });
    expect(html).toContain(nearbyMacsWords.label);
    expect(html).toContain(">Studio<");
    expect(html).toContain("kun@Studio.local");
    expect(html).toContain("kun@Kuns-Mac-mini.local");
    expect(html).not.toContain(nearbyMacsWords.looking);
    // Only the Mac mini is on the list already.
    expect(html.match(/data-device-nearby-on-list/g)).toHaveLength(1);
    const mini = html.slice(html.indexOf('data-device-nearby-mac="Kuns-Mac-mini.local"'));
    expect(mini.slice(0, mini.indexOf("</button>"))).toContain(
      `data-device-nearby-on-list="">${nearbyMacsWords.onList}<`,
    );
    // The list is one Tab stop: its first row.
    expect(html).toMatch(/data-device-nearby-mac="Studio\.local" tabindex="0"/);
    expect(html).toMatch(/data-device-nearby-mac="Kuns-Mac-mini\.local" tabindex="-1"/);
    // The field still takes any address.
    expect(html).toContain('placeholder="you@mini.local"');
  });

  it("says it is looking while no Mac answered, and nothing while it does not look", () => {
    const looking = render({
      askingAddress: true,
      nearby: { state: "looking", user: "kun", macs: [] },
    });
    expect(looking).toContain(nearbyMacsWords.looking);
    expect(render({ askingAddress: true })).not.toContain("data-device-nearby");
  });

  it("says when macOS has not allowed the local network, and the field still takes an address", () => {
    const html = render({
      askingAddress: true,
      addressDraft: "sam@studio.internal",
      nearby: { state: "not-allowed", user: "kun", macs: [] },
    });
    for (const line of nearbyMacsWords.notAllowed)
      expect(html).toContain(line.replaceAll("&", "&amp;"));
    expect(html).toContain('value="sam@studio.internal"');
    expect(html).toMatch(/<button[^>]*type="submit"(?![^>]*disabled)[^>]*>Add it<\/button>/);
    const failed = render({
      askingAddress: true,
      nearby: { state: "failed", user: null, macs: [] },
    });
    expect(failed).toContain(nearbyMacsWords.failed);
  });

  it("moves through Macs nearby as a list does, and leaves it for the field above", () => {
    expect(nearbyStep("ArrowDown", 0, 3)).toBe(1);
    expect(nearbyStep("ArrowDown", 2, 3)).toBe(2);
    expect(nearbyStep("ArrowUp", 1, 3)).toBe(0);
    expect(nearbyStep("ArrowUp", 0, 3)).toBe(-1);
    expect(nearbyStep("Home", 2, 3)).toBe(0);
    expect(nearbyStep("End", 0, 3)).toBe(2);
    expect(nearbyStep("Enter", 0, 3)).toBeNull();
  });

  it("keeps a refused address in the field, with the two lines and Try again", () => {
    const [what, todo] = remoteLoginWords.refused("unreachable", {
      address: "sam@mini.local",
    });
    const html = render({
      askingAddress: true,
      addressDraft: "sam@mini.local",
      addressRefusal: [what, todo],
    });
    expect(html).toContain("data-device-address-question");
    expect(html).toContain('value="sam@mini.local"');
    expect(html).toContain("data-device-address-refusal");
    expect(html).toContain(what);
    expect(html).toContain(todo);
    expect(html).toContain(">Try again<");
    expect(html).toContain(">Cancel<");
    expect(html).not.toContain(">Add it<");
    expect(html).not.toContain("data-settings-error");
  });

  it("asks once before adding a Mac whose user runs another Firstmate's work, with Cancel focused", () => {
    const html = render({
      leaving: { asks: "leave", address: "sam@mini.local", name: "Mac mini" },
    });
    expect(html).toContain('data-device-leave-question="sam@mini.local"');
    const [found, leaves, stays] = remoteLoginWords.leaveQuestion({
      address: "sam@mini.local",
      name: "Mac mini",
    });
    for (const line of [found, leaves, stays])
      expect(html).toContain(String(line).replaceAll("'", "&#x27;"));
    expect(html).toContain("Leave it and add");
    // Enter never leaves it: Cancel holds the focus.
    expect(html).toMatch(/<button[^>]*autofocus=""[^>]*>Cancel<\/button>/i);
  });

  it("stands a Mac in the list while it is reached and set up, and says when one is updating", () => {
    const reaching = render({ adding: [{ address: "sam@mini.local", stage: "reaching" }] });
    expect(reaching).toContain('data-device-adding="sam@mini.local"');
    expect(reaching).toContain("a computer · sam@mini.local");
    expect(reaching).toContain("Reaching sam@mini.local with your SSH key…");
    const settingUp = render({
      adding: [
        {
          address: "sam@mini.local",
          stage: "setting-up",
          name: "Mac mini",
          copy: { state: "preparing" },
        },
      ],
    });
    expect(settingUp).toContain(">Mac mini<");
    expect(settingUp).toContain(remoteLoginWords.settingUpRow("Mac mini"));
    // How far the copy has gone: the bytes sent so far, then starting it there.
    const sending = render({
      adding: [
        {
          address: "sam@mini.local",
          stage: "setting-up",
          name: "Mac mini",
          copy: { state: "sending", sent: 42_300_000 },
        },
      ],
    });
    expect(sending).toContain('data-copy="sending"');
    expect(sending).toContain(remoteLoginWords.sendingRow("Mac mini", 42_300_000));
    expect(sending).toContain("40.3 MB sent");
    expect(words(sending)).not.toMatch(/\d+%/);
    const starting = render({
      adding: [
        {
          address: "sam@mini.local",
          stage: "setting-up",
          name: "Mac mini",
          copy: { state: "starting" },
        },
      ],
    });
    expect(starting).toContain(remoteLoginWords.startingRow("Mac mini"));

    const added = { ...MINI, inReach: true, remoteLogin: "sam@mini.local" };
    const updating = render({ devices: [added], updating: [added.id] });
    expect(updating).toContain("Updating Infinitary on Mac mini…");
    // While it updates, it cannot be removed.
    expect(acts(updating)).not.toContain("remove");
  });

  it("says when a computer added by a command still looks for this Mac at its old address, and how it comes back", () => {
    expect(strandedLine({ ...MINI, addressChanged: true })).toBe(
      "It still looks for this computer at its old address. A new command run there brings it back.",
    );
    const builder = { ...BUILDER, inReach: false, addressChanged: true };
    expect(strandedLine(builder)).toBe(
      "It still looks for this computer at its old address. A new command run as Builder brings it back.",
    );
    // Out of reach for any other reason, or back in reach, it says nothing of the address.
    expect(strandedLine(MINI)).toBeNull();
    expect(strandedLine({ ...MINI, inReach: true, addressChanged: true })).toBeNull();
    // A new command once this Mac's address changed, for another Mac or that user.
    expect(wayBack(MINI)).toBeNull();
    expect(wayBack({ ...MINI, addressChanged: true })).toEqual({
      label: "Make a command",
      does: "command",
    });
    expect(wayBack(builder)).toEqual({ label: "Make a command", does: "user-command" });
    expect(render({ devices: [builder] })).toContain(">Make a command<");
    expect(render({ devices: [MINI] })).not.toContain("data-device-stranded");
    // Added by its address, it is reached over this Mac's own SSH, which follows this Mac.
    const byAddress = { ...MINI, remoteLogin: "sam@mini.local", addressChanged: true };
    expect(strandedLine(byAddress)).toBeNull();
    expect(wayBack(byAddress)).toBeNull();
  });

  it("says why a Mac a command added never reached this Mac on the local network, and asks for its address in place", () => {
    const { seenAt: _never, ...joined } = MINI;
    const held: DeviceView = { ...joined, heldOnLocalNetwork: true };
    expect(heldLine(held)).toBe(
      "It has not reached this computer since it joined. macOS lets Infinitary on Mac mini use your local network only once someone there allows it. Added by its address, this computer reaches it with your SSH key instead.",
    );
    expect(lines(held)).toEqual({
      identity: `a computer · joined today ${time(MINI.pairedAt)}`,
      status: "out of reach",
    });
    // Out of reach for any other reason, or in reach, it says nothing of this.
    expect(heldLine(MINI)).toBeNull();
    expect(heldLine({ ...held, inReach: true })).toBeNull();
    const html = render({ devices: [held] });
    expect(html).toContain('data-device-held=""');
    expect(html).toContain('aria-label="Add Mac mini by its address"');
    expect(html).toMatch(
      /data-device-held=""><span[^>]*>[^<]*<\/span><button[^>]*>Add it by its address</,
    );
    expect(acts(html)).toContain("remove");
    expect(render({ devices: [MINI] })).not.toContain("by its address<");
    // Asked in place: where to reach it with SSH, as the user it runs work as.
    const asking = render({ devices: [held], changing: held.id });
    expect(asking).toContain(`data-device-address-change="${held.id}"`);
    expect(asking).toContain(">Where to reach Mac mini<");
    expect(asking).toContain("The address you use with SSH for it, as sam.");
    expect(asking).toContain('placeholder="sam@mini.local"');
    expect(asking).toContain(">Add it<");
    expect(asking).toContain(">Cancel<");
    expect(acts(asking)).not.toContain("remove");
    // Added there, its own row says where that stands, with no reason and no button.
    const finding = render({
      devices: [held],
      adding: [{ address: "sam@mini.local", stage: "finding", name: "Mac mini", deviceId: "mini" }],
    });
    expect(finding).toContain("Telling Mac mini where this computer is now…");
    expect(finding).not.toContain("data-device-held");
    expect(finding).not.toContain("by its address<");
  });

  // The captain's ask (INF-4835): "Set it up again by itself, and say why when it still cannot".
  it("says why a Mac's work cannot start while its window is connected, with Fix it before Add it by its address", () => {
    const { seenAt: _never, ...joined } = MINI;
    const imac: DeviceView = {
      ...joined,
      id: "imac",
      kind: "mac",
      name: "iMac",
      inReach: false,
      controlling: true,
      workSetup: { state: "blocked", reason: "background-off" },
    };
    expect(workSetupLine(imac)).toBe(
      "Its work cannot start: Infinitary on iMac is not allowed to run in the background. On a Mac, turn it on there in System Settings › General › Login Items.",
    );
    const html = render({ devices: [imac] });
    expect(html).toContain('data-device-work-setup="background-off"');
    expect(html).toContain('aria-label="Set up the work on iMac again"');
    expect(html.indexOf('data-device-work-setup="background-off"')).toBeLessThan(
      html.indexOf(">Fix it<"),
    );
    expect(acts(html)).toContain("remove");

    // Held on the local network, its own line says why, and Fix it comes before Add it by its address.
    const held: DeviceView = {
      ...imac,
      heldOnLocalNetwork: true,
      workSetup: { state: "blocked", reason: "local-network" },
    };
    expect(workSetupLine(held)).toBeNull();
    const heldHtml = render({ devices: [held] });
    expect(heldHtml).toContain('data-device-held=""');
    expect(heldHtml.indexOf(">Fix it<")).toBeLessThan(heldHtml.indexOf("Add it by its address<"));
    // While its work is starting it says so, with no Fix it; in reach, nothing.
    const starting: DeviceView = { ...imac, workSetup: { state: "starting" } };
    expect(deviceState(starting)).toEqual({ text: "setting up", tone: "idle" });
    expect(render({ devices: [starting] })).not.toContain(">Fix it<");
    expect(workSetupLine({ ...imac, inReach: true })).toBeNull();
    expect(render({ devices: [{ ...imac, inReach: true }] })).not.toContain(">Fix it<");
  });

  it("says where this Mac's own SSH connection to a computer added by its address stands, with Try again only when it needs the captain", () => {
    const at = { ...MINI, remoteLogin: "sam@mini.local" };
    const row = (ssh: DeviceView["ssh"], extra: Partial<DeviceView> = {}) =>
      lines({ ...at, ...extra, ...(ssh ? { ssh } : {}) });
    // Named by its address on its mono line; where its connection stands is its status.
    expect(row({ state: "connected" }, { inReach: true, tasks: 0 })).toEqual({
      identity: "a computer · sam@mini.local",
      status: "idle",
    });
    expect(row({ state: "connecting" }).status).toBe("connecting");
    expect(row({ state: "reconnecting" }, { seenAt: NOW }).status).toBe("Reconnecting via SSH");
    // Starting at the next login, and could not start, are two things.
    expect(row({ state: "at-login" }).status).toBe("starts the next time sam logs in there");
    expect(row({ state: "not-started" }).status).toBe("could not start");
    expect(
      lines({
        ...BUILDER,
        inReach: false,
        remoteLogin: "builder@127.0.0.1",
        ssh: { state: "at-login" },
      }),
    ).toEqual({
      identity: "another user on this computer · builder@127.0.0.1",
      status: "starts the next time Builder logs in",
    });

    const reconnecting = render({ devices: [{ ...at, ssh: { state: "reconnecting" } }] });
    expect(reconnecting).not.toContain("Try again");
    expect(reconnecting).not.toContain("Bring it back");
    expect(acts(reconnecting)).toContain("address");

    // Stopped: why, in warn, with Try again beside it; Change address and Remove wait in the menu.
    const stopped = { ...at, ssh: { state: "stopped" as const, reason: "host-changed" as const } };
    expect(sshStoppedLine(stopped)).toBe(
      sshConnectionWords
        .stopped("host-changed", { address: "sam@mini.local", device: at })
        .join(" "),
    );
    expect(lines(stopped)).toEqual({
      identity: "a computer · sam@mini.local",
      status: `out of reach since ${time(MINI.seenAt ?? 0)}`,
    });
    const html = render({ devices: [stopped] });
    expect(html).toContain("does not answer as the computer this computer reached before.");
    expect(html).toContain('data-device-ssh-stopped=""');
    expect(html).toContain('aria-label="Try again to reach Mac mini"');
    expect(html).toMatch(
      /data-device-ssh-stopped=""><span[^>]*>[^<]*<\/span><button[^>]*>Try again</,
    );
    expect(acts(html)).toEqual(["address", "standby-keep", "remove"]);
    // A computer added by a command has no SSH connection to say.
    expect(acts(render({ devices: [MINI] }))).not.toContain("address");
  });

  it("changes a computer's address in place: asks where, then reaches it there", () => {
    const at = { ...MINI, remoteLogin: "sam@mini.local", ssh: { state: "reconnecting" as const } };
    const asking = render({ devices: [at], changing: at.id });
    expect(asking).toContain(">Where to reach Mac mini<");
    expect(asking).toContain('value="sam@mini.local"');
    expect(asking).toContain(">Change it<");
    expect(asking).toContain(">Cancel<");
    expect(acts(asking)).not.toContain("remove");
    const moving = render({
      devices: [at],
      moving: [{ deviceId: at.id, address: "sam@studio.local" }],
    });
    expect(moving).toContain("Reaching sam@studio.local with your SSH key…");
    expect(acts(moving)).not.toContain("address");
    expect(acts(moving)).not.toContain("remove");
  });

  it("finds a computer it already lists again on its own row: reached, then told where this Mac is now", () => {
    const byAddress = {
      ...MINI,
      remoteLogin: "sam@mini.local",
      ssh: { state: "reconnecting" as const },
    };
    const reaching = render({
      devices: [byAddress],
      adding: [{ address: "sam@mini.local", stage: "reaching", deviceId: "mini" }],
    });
    expect(reaching).toContain("Reaching sam@mini.local with your SSH key…");
    // No second row stands in the list for it.
    expect(reaching).not.toContain("data-device-adding");
    const finding = render({
      devices: [byAddress],
      adding: [{ address: "sam@mini.local", stage: "finding", name: "Mac mini", deviceId: "mini" }],
    });
    expect(finding).toContain("Telling Mac mini where this computer is now…");
    expect(finding).not.toContain("data-device-adding");
    // Its own row says how far the copy has gone too.
    const sending = render({
      devices: [byAddress],
      adding: [
        {
          address: "sam@mini.local",
          stage: "finding",
          name: "Mac mini",
          deviceId: "mini",
          copy: { state: "sending", sent: 5_000_000 },
        },
      ],
    });
    expect(sending).toContain(remoteLoginWords.sendingRow("Mac mini", 5_000_000));
    expect(sending).not.toContain("data-device-adding");
    // While it works there is no state and no Remove.
    for (const html of [reaching, finding, sending]) {
      expect(html).not.toContain(">out of reach<");
      expect(acts(html)).not.toContain("remove");
      expect(acts(html)).not.toContain("address");
    }
    // Typed into + A Mac's address, it stands on its own row until the core names the computer.
    const typed = render({
      devices: [byAddress],
      adding: [{ address: "sam@mini.local", stage: "reaching" }],
    });
    expect(typed).toContain('data-device-adding="sam@mini.local"');
    // A computer the list does not hold yet says the same on that row.
    const unlisted = render({
      devices: [],
      adding: [{ address: "sam@mini.local", stage: "finding", name: "Mac mini", deviceId: "mini" }],
    });
    expect(unlisted).toContain('data-device-adding="sam@mini.local"');
    expect(unlisted).toContain("Telling Mac mini where this computer is now…");
  });

  it("shows the check line before anything is sent, with Cancel beside This is the Mac", () => {
    const [question, compare] = remoteLoginWords.confirmQuestion("sam@mini.local");
    const html = render({
      confirming: {
        asks: "confirm",
        address: "sam@mini.local",
        line: "ED25519 SHA256:abCd",
      },
    });
    expect(html).toContain(question);
    expect(html).toContain(compare);
    expect(html).toContain("ED25519 SHA256:abCd");
    expect(html).toContain("This is the computer");
    expect(html).toContain("Cancel");
    expect(html).not.toContain("Terminal");
  });

  it("asks for that user's password once in a hidden field, says a wrong one, and holds no password itself", () => {
    const [found, say] = remoteLoginWords.passwordQuestion("sam@mini.local");
    const asked = { asks: "password" as const, address: "sam@mini.local", user: "sam" };
    const html = render({ passwording: asked });
    const markup = (line: string) => line.replaceAll("'", "&#x27;");
    expect(html).toContain('data-device-password-question="sam@mini.local"');
    expect(html).toContain(markup(found));
    expect(html).toContain(markup(say));
    expect(html).toContain('type="password"');
    expect(html).toContain(`aria-label="${markup(remoteLoginWords.passwordField("sam"))}"`);
    expect(html).toContain(">Add it<");
    expect(html).toContain(">Cancel<");
    // Nothing is said wrong until a password did not work, and none is in the field.
    expect(html).not.toContain("data-device-password-refusal");
    expect(html).toContain('value=""');
    const [what, todo] = remoteLoginWords.refused("password-wrong", { address: "sam@mini.local" });
    const wrong = render({ passwording: { ...asked, wrong: true } });
    expect(wrong.match(/data-device-password-refusal/g)).toHaveLength(2);
    expect(wrong).toContain(markup(what));
    expect(wrong).toContain(markup(todo));
    expect(wrong).toContain('value=""');
    // While it lets Firstmate's own key in, the row says so.
    const letting = render({ adding: [{ address: "sam@mini.local", stage: "letting-in" }] });
    expect(letting).toContain(markup(remoteLoginWords.lettingInRow("sam@mini.local")));
  });

  it("shows a command in its panel, for another Mac or another user on this Mac", () => {
    const command = "'/bin/sh' '-c' 'L=...' 'firstmate'";
    const work = { id: "c1", link: LINK, kind: "work" as const, expiresAt: NOW + 581_000 };
    const mac = render({
      panel: {
        state: "open",
        invite: { ...work, command: { for: "another-mac", text: command } },
        make: "command",
      },
    });
    expect(mac).toContain("New command · another computer");
    expect(mac).toContain(
      "Run this once in Terminal on the other computer, as the user who should run its work. It gets Infinitary from this computer, so both need the same network.",
    );
    expect(mac).toContain("Copy command");
    expect(mac).toContain("&#x27;/bin/sh&#x27;");
    expect(mac).toContain("works once · 9:41 left");

    const user = render({
      panel: {
        state: "open",
        invite: { ...work, command: { for: "another-user", text: "'app' 'work' 'join'" } },
        make: "user-command",
      },
    });
    expect(user).toContain("New command · running as another user");
    expect(user).toContain(
      "Log in as the user who should run the work, and run this once in Terminal. Switch back when it says it joined.",
    );

    const joined = render({
      panel: {
        state: "joined",
        line: "Running as Builder is set up. It runs work only, and has no sign-ins yet.",
        work: true,
      },
    });
    expect(joined).toContain("Give it a project in Projects when you want it to run work.");
    expect(render({ panel: { state: "expired", make: "command" } })).toContain(
      "The command expired before any computer used it.",
    );
  });

  it("lists each computer that runs work with what it runs, its sign-ins, its tasks and when it was seen", () => {
    const signIns: DeviceSignIns[] = [
      {
        deviceId: "builder",
        name: "MacBook Pro",
        user: "builder",
        onThisMac: true,
        reach: "in-reach",
        signIns: {
          providers: [],
          accounts: [
            {
              id: "a1",
              providerId: "openai-codex",
              kind: "subscription_oauth",
              label: "Personal",
              enabled: true,
              connected: true,
              pinned: false,
              createdAt: 1,
            },
          ],
          quota: null,
          forges: {
            signIns: [{ host: "github.com", name: "GitHub", login: "sam", state: "ok", since: 1 }],
            hosts: [],
          },
        },
      },
    ];
    const home = render({ devices: [MINI, BUILDER], signIns, selection: null });
    const peer = render({ devices: [MINI, BUILDER], signIns, selection: MINI.id });
    const html =
      home.slice(home.indexOf("data-device-inspector")) +
      peer.slice(peer.indexOf("data-device-inspector"));
    // Another user on this Mac sits right after This Mac.
    expect(html.indexOf("Running as Builder")).toBeLessThan(html.indexOf("Mac mini"));
    expect(html).toContain("Running as Builder");
    expect(words(html)).toContain(
      "another user on this computer · runs work only, while Builder is logged in",
    );
    expect(html).toContain("Runs website · Signed in to Codex and GitHub");
    expect(html).toContain(">1 task<");
    expect(html).toContain("Mac mini");
    // Out of reach is said once, on its head, with since when.
    expect(html).toContain(`>out of reach since ${time(MINI.seenAt ?? 0)}<`);
    expect(html).toContain("Runs website and api");
    expect(acts(html, "builder")).toContain("remove");
    expect(acts(html, "mini")).toContain("remove");
  });

  it("asks before removing a computer that runs work, and how when it is out of reach", () => {
    expect(removeLines(BUILDER)).toEqual([
      "Remove Running as Builder? Its unmerged work comes to this computer first.",
      "Its task on website stops. Infinitary then removes what it set up there, with its sign-ins.",
      "website runs on this computer after.",
    ]);
    expect(removeLines(MINI)).toEqual([
      "Remove Mac mini? It is out of reach.",
      "Its unmerged work on website and api is still there. Wait, and it comes to this computer before Mac mini is removed.",
    ]);
    const away = render({ devices: [MINI], removing: "mini" });
    expect(away).toContain("Remove when it is back");
    expect(away).toContain("Remove now");
    expect(away.indexOf("Keep it")).toBeLessThan(away.indexOf("Remove when it is back"));
    const near = render({ devices: [BUILDER], removing: "builder" });
    expect(near).not.toContain("Remove now");
    expect(near.indexOf("Keep it")).toBeLessThan(near.lastIndexOf(">Remove<"));
  });

  it("says where a removal stands, and offers Keep it while it waits for the computer", () => {
    expect(deviceSummary({ ...MINI, inReach: true, removal: "bringing-work" }, undefined)).toBe(
      "Bringing website and api's unmerged work to this computer…",
    );
    expect(deviceSummary({ ...BUILDER, removal: "cleaning-up" }, undefined)).toBe(
      "Removing what Infinitary set up as Builder…",
    );
    // Waiting: out of reach on its head, and a strip that says it goes when back, with Keep it.
    const waiting = render({ devices: [{ ...MINI, removal: "when-back" }] });
    expect(waiting).toContain(`>out of reach since ${time(MINI.seenAt ?? 0)}<`);
    expect(waiting).toMatch(
      /data-notice="removal"><span[^>]*>It is removed when it is back.<\/span><button[^>]*>Keep it</,
    );
    expect(acts(waiting)).not.toContain("remove");
    expect(lines({ ...BUILDER, inReach: false, restartedSince: true })).toEqual({
      identity: "another user on this computer · runs work only, while Builder is logged in",
      status: "not logged in since this computer restarted",
    });
    expect(deviceState({ ...BUILDER, tasks: 0 })).toEqual({ text: "idle", tone: "idle" });
    expect(deviceState({ ...BUILDER, tasks: 2 })).toEqual({ text: "2 tasks", tone: "busy" });
    // Just updated and still connecting, it is not out of reach; a connection
    // that stopped, or whose work did not start, is.
    const remote = { ...MINI, remoteLogin: "sam@mini.local" };
    expect(deviceState({ ...remote, ssh: { state: "connecting" } })).toEqual({
      text: "connecting",
      tone: "idle",
    });
    expect(deviceState({ ...remote, seenAt: NOW, ssh: { state: "reconnecting" } })).toEqual({
      text: "Reconnecting via SSH",
      tone: "idle",
    });
    for (const state of ["at-login", "not-started", "stopped"] as const)
      expect(deviceState({ ...remote, ssh: { state } })).toEqual({
        text: "out of reach",
        tone: "warn",
      });
    expect(deviceState(MINI)).toEqual({ text: "out of reach", tone: "warn" });
    // Every line that names it out of reach says connecting while it connects.
    const connecting = { ...remote, ssh: { state: "connecting" } } as const;
    expect(removeLines(connecting)[0]).toBe("Remove Mac mini? It is connecting.");
    expect(removeLines({ ...remote, ssh: { state: "stopped" } })[0]).toBe(
      "Remove Mac mini? It is out of reach.",
    );
    expect(lines({ ...connecting, removal: "when-back" }).status).toBe("connecting");
    expect(render({ devices: [{ ...connecting, removal: "when-back" }] })).toContain(
      "It is removed when it is back.",
    );
    // The dot is grey while it connects, orange once it is out of reach.
    expect(render({ devices: [connecting] })).toContain('data-device-dot="" data-tone="idle"');
    expect(render({ devices: [{ ...remote, ssh: { state: "stopped" } }] })).toContain(
      'data-device-dot="" data-tone="warn"',
    );
    // The captain's ask: one the home is updating reads updating, calm, never
    // out of reach - even when Devices opened mid-update - and its row follows
    // the update's step as one clicked here does.
    const updating = { ...MINI, updating: true } as const;
    expect(removeLines(updating)[0]).toBe("Remove Mac mini? It is updating.");
    const followed = render({ devices: [updating] });
    expect(followed).toContain('data-device-dot="" data-tone="idle"');
    expect(followed).toContain(remoteLoginWords.updatingRow(updating));
    expect(followed).not.toContain("out of reach");
  });

  it("says when a computer in reach has another version of Firstmate, and offers Update", () => {
    const older: DeviceView = {
      ...BUILDER,
      otherVersion: { app: "0.1.20", than: "older", takesWork: true, updateBy: "connection" },
    };
    const html = render({ devices: [older] });
    expect(html).toContain("Has Infinitary 0.1.20, older than this computer&#x27;s.");
    expect(html).not.toContain("It takes no new work");
    // It still takes work: in reach, its tasks on the right.
    expect(html).toContain('data-tone="ok"');
    expect(html).toContain(">1 task<");
    expect(html).toContain(
      `aria-label="${m.settingsDevicesMatchNamed({ device: "Running as Builder" })}"`,
    );
    expect(html).toMatch(
      new RegExp(
        `data-notice="version"><span[^>]*>[^<]*</span><button[^>]*>${m.settingsDevicesMatch()}<`,
      ),
    );
    expect(acts(html)).toContain("remove");

    // Another major takes no new work: still seen, in warn, with no new work on the right.
    const noWork: DeviceView = {
      ...MINI,
      inReach: false,
      otherVersion: { app: "0.1.12", than: "older", takesWork: false, updateBy: "command" },
    };
    const away = render({ devices: [noWork] });
    expect(away).toContain(
      "Has Infinitary 0.1.12, older than this computer&#x27;s. It takes no new work until it is updated.",
    );
    expect(words(away)).toContain("a computer · joined today");
    expect(away).toContain(">no new work<");
    expect(away).not.toContain("out of reach");

    expect(deviceState(noWork)).toEqual({ text: "no new work", tone: "warn" });
    expect(away).toContain(`>${m.settingsDevicesMatch()}<`);

    // One too old to say its version, or newer than this Mac's.
    expect(deviceWords.otherVersion({ than: "older", takesWork: true, updateBy: "command" })).toBe(
      "Has an older Infinitary than this computer.",
    );
    expect(
      deviceWords.otherVersion({
        app: "0.1.31",
        than: "newer",
        takesWork: true,
        updateBy: "connection",
      }),
    ).toBe("Has Infinitary 0.1.31, newer than this computer's.");

    // While it updates, it says so in place of its version, with no Update or Remove.
    const updating = render({ devices: [older], updating: [older.id] });
    expect(updating).toContain("Updating Infinitary on Running as Builder…");
    expect(updating).not.toContain("Has Infinitary");
    expect(updating).not.toContain(`>${m.settingsDevicesMatch()}<`);
    expect(acts(updating)).not.toContain("remove");
    // Connected on another version, it is not out of reach: no way back.
    const byAddress: DeviceView = {
      ...noWork,
      remoteLogin: "sam@mini.local",
      addressChanged: true,
    };
    expect(wayBack(byAddress)).toBeNull();
    expect(strandedLine(byAddress)).toBeNull();
    // On this Mac's version there is no Match.
    expect(render({ devices: [BUILDER] })).not.toContain(`>${m.settingsDevicesMatch()}<`);
  });

  // INF-5635's plan, piece 3: one Match brings any computer to this computer's build, older or newer.
  it("offers one Match button on a computer with another version, older or newer", () => {
    for (const than of ["older", "newer"] as const) {
      const other: DeviceView = {
        ...BUILDER,
        otherVersion: { app: "0.1.31", than, takesWork: true, updateBy: "connection" },
      };
      const html = render({ devices: [other] });
      const label = deviceLabel(other);
      expect(html).toContain(`Has Infinitary 0.1.31, ${than} than this computer&#x27;s.`);
      expect(html).toContain(`>${m.settingsDevicesMatch()}<`);
      expect(html).toContain(`aria-label="${m.settingsDevicesMatchNamed({ device: label })}"`);
    }
  });

  // INF-5372's plan, piece 1: each copy's version, and any copy behind this computer's marked.
  it("lists the version of each copy on a device, marking an app behind this computer's", () => {
    const behind = (html: string) => html.includes("data-behind");
    const said = (html: string) => words(html).replaceAll("&#x27;", "'");
    // The user's Mac user that only controls, still on 0.8.3.
    const older = render({ devices: [{ ...AIR, appVersion: { app: "0.8.3", than: "older" } }] });
    expect(said(older)).toContain("Its app has Infinitary 0.8.3, older than this computer's.");
    expect(behind(older)).toBe(true);
    // An app from before apps said their version is behind too.
    const unsaid = render({ devices: [{ ...AIR, appVersion: {} }] });
    expect(said(unsaid)).toContain("Its app has an older Infinitary, too old to say its version.");
    expect(behind(unsaid)).toBe(true);
    // A phone's version is its own: said, never marked.
    const phone = render({
      devices: [
        { ...AIR, name: "Kun's iPhone", system: "ios", appVersion: { app: "0.1.0 (212)" } },
      ],
    });
    expect(said(phone)).toContain("Its app has version 0.1.0 (212).");
    expect(behind(phone)).toBe(false);
    // A Mac whose app and work both run this computer's version: a mark on its mono line, no sentence.
    const mac: DeviceView = {
      ...BUILDER,
      kind: "mac",
      controlling: true,
      workVersion: "0.8.4",
      appVersion: { app: "0.8.4", same: true },
    };
    const same = render({ devices: [mac] });
    expect(deviceIdentity(mac, NOW)).toMatch(/ · Infinitary 0\.8\.4$/);
    expect(said(same)).not.toContain("as this computer does");
    expect(same).not.toContain("data-device-copy-versions");
    // Only its work connected, on this computer's version: the same mark.
    expect(deviceIdentity({ ...mac, appVersion: undefined }, NOW)).toMatch(
      / · Infinitary 0\.8\.4$/,
    );

    // Its app behind while its work is current: both said, the line marked.
    const split = render({ devices: [{ ...mac, appVersion: { app: "0.8.3", than: "older" } }] });
    expect(said(split)).toContain(
      "Its app has Infinitary 0.8.3, older than this computer's. Its work runs Infinitary 0.8.4, as this computer does.",
    );
    expect(behind(split)).toBe(true);
    // Nothing open and its work out of reach: nothing is said of a version.
    expect(render({ devices: [AIR] })).not.toContain("data-device-copy-versions");
  });

  // INF-5372's plan, piece 2: the app updates by itself while nobody uses it, the row says each
  // step, and the captain's "i think we should still provide a manual update flow in the devices view".
  it("says each step of an app catching up, and offers Update app until it restarts or cannot", () => {
    const said = (html: string) => words(html).replaceAll("&#x27;", "'");
    const following = (follow: NonNullable<DeviceView["appVersion"]>["follow"]) =>
      render({
        devices: [{ ...AIR, appVersion: { app: "0.8.3", than: "older", follow } }],
        onUpdateApp: noop,
      });
    const getting = following({ version: "0.8.4", step: "getting", percent: 40 });
    expect(said(getting)).toContain(
      "Its app updates to Infinitary 0.8.4 by itself: 40% downloaded.",
    );
    expect(getting).toContain('aria-label="Update the app on MacBook Air"');
    const waiting = following({ version: "0.8.4", step: "waiting" });
    expect(said(waiting)).toContain(
      "Its app has Infinitary 0.8.4 ready and starts again on it once nobody uses it there.",
    );
    expect(waiting).toContain("data-device-update-app");
    const restarting = following({ version: "0.8.4", step: "restarting" });
    expect(said(restarting)).toContain("Its app starts again on Infinitary 0.8.4.");
    expect(restarting).not.toContain("data-device-update-app");
    const cannot = following({ version: "0.8.4", step: "cannot", reason: "own-window" });
    expect(said(cannot)).toContain(
      "Its app cannot update to Infinitary 0.8.4 by itself. It updates only from its own window there, so update it there.",
    );
    expect(cannot).not.toContain("data-device-update-app");
    const failed = following({
      version: "0.8.4",
      step: "failed",
      problem: "The network went away.",
    });
    expect(said(failed)).toContain("Its app could not update to Infinitary 0.8.4 by itself.");
    expect(failed).toContain("data-device-update-app");
    // A computer that runs work settling, here being removed, says the step but offers no
    // Update app, as every strip hides its button then.
    const removing = render({
      devices: [
        {
          ...AIR,
          kind: "work",
          removal: "cleaning-up",
          appVersion: {
            app: "0.8.3",
            than: "older",
            follow: { version: "0.8.4", step: "waiting" },
          },
        },
      ],
      onUpdateApp: noop,
    });
    expect(removing).toContain('data-device-app-follow="waiting"');
    expect(removing).not.toContain("data-device-update-app");
    // An app from before says no step, and the row offers nothing new.
    const before = render({
      devices: [{ ...AIR, appVersion: { app: "0.8.3", than: "older" } }],
      onUpdateApp: noop,
    });
    expect(before).not.toContain("data-device-app-follow");
    expect(before).not.toContain("data-device-update-app");
  });

  // INF-4260's plan, piece 10, and review INF-4743 (the captain's pick: say
  // to install the newer Infinitary on that PC): a Windows PC updates itself
  // only from its own Version row (INF-4258), and the home sends it no build
  // over the connection, so its row says to install the newer Infinitary
  // there, with no Update button.
  it("says to install the newer Infinitary on a Windows PC on another version, with no Update", () => {
    const pc: DeviceView = {
      ...MINI,
      system: "windows",
      inReach: true,
      otherVersion: { app: "0.1.20", than: "older", takesWork: false, updateBy: "connection" },
    };
    const html = render({ devices: [pc] });
    expect(html).toContain(
      "Has Infinitary 0.1.20, older than this computer&#x27;s. It takes no new work until it is updated. Install the newer Infinitary on that computer.",
    );
    expect(html).not.toContain(`>${m.settingsDevicesMatch()}<`);
    expect(acts(html)).toContain("remove");
  });

  it("says a Mac added by its address runs work for another Firstmate now, and asks only to remove it here now", () => {
    const left: DeviceView = {
      ...MINI,
      remoteLogin: "sam@mini.local",
      ssh: { state: "stopped", reason: "other-home" },
    };
    expect(sshStoppedLine(left)).toBe(
      "sam@mini.local runs work for another first mate now. Remove Mac mini here. Nothing changes there for the other first mate.",
    );
    const row = render({ devices: [left] });
    expect(row).not.toContain("reaches a computer that is not");
    expect(acts(row)).toEqual(["remove"]);
    expect(row).not.toContain("Try again");

    // Its work never comes to this computer, so Remove asks nothing about waiting for it.
    expect(removeLines(left)).toEqual([
      "Remove Mac mini? It runs work for another first mate now.",
      "Its unmerged work on website and api stays there. Nothing changes there for the other first mate.",
    ]);
    const asking = render({ devices: [left], removing: "mini" });
    expect(asking).not.toContain("Remove when it is back");
    expect(asking).not.toContain("comes to");
    expect(asking).toContain("Remove now");
    expect(asking.indexOf("Keep it")).toBeLessThan(asking.indexOf("Remove now"));
    // Stopped for any other reason, it may still come back, and Remove may wait for it.
    const changed: DeviceView = { ...left, ssh: { state: "stopped", reason: "host-changed" } };
    expect(render({ devices: [changed], removing: "mini" })).toContain("Remove when it is back");
    const changedRow = render({ devices: [changed] });
    expect(changedRow).toContain("Try again");
    expect(acts(changedRow)).toContain("address");
  });

  it("asks before removing a computer that takes no new work, which waits until it is updated", () => {
    const noWork: DeviceView = {
      ...MINI,
      otherVersion: { than: "older", takesWork: false, updateBy: "command" },
    };
    expect(removeLines(noWork)).toEqual([
      "Remove Mac mini? It takes no new work.",
      "Its unmerged work on website and api is still there. Update it, and its work comes to this computer before Mac mini is removed.",
    ]);
    const asking = render({ devices: [noWork], removing: "mini" });
    expect(asking).toContain("Remove once it is updated");
    expect(asking).toContain("Remove now");
    const waiting = render({ devices: [{ ...noWork, removal: "when-back" }] });
    expect(waiting).toContain(">no new work<");
    expect(waiting).toMatch(
      /data-notice="removal"><span[^>]*>It is removed once it is updated.<\/span><button[^>]*>Keep it</,
    );
  });

  it("lists every way a link carries, and offers nothing to choose", () => {
    const two: DeviceAddresses = {
      addresses: [
        { address: "192.168.1.20", network: "local" },
        { address: "100.101.7.3", network: "private" },
      ],
      chosen: null,
      current: "192.168.1.20",
      name: "kuns-macbook-pro.local",
    };
    const many = render({
      addresses: two,
      selection: null,
      devices: [{ ...AIR, reachedOn: "local" }],
    });
    expect(many).toContain("data-device-inspector");
    expect(many.indexOf("Preferred address")).toBeLessThan(many.indexOf("Local address"));
    expect(many).toContain("1 computer");
    expect(many).toContain("Local address");
    expect(many).toContain("192.168.1.20");
    expect(many).toContain("kuns-macbook-pro.local");
    expect(many).toContain("Preferred address");
    expect(many).toContain("100.101.7.3");
    expect(many).toContain("Over the internet");
    expect(many).toContain("Copy a link");
    expect(many).toContain("Copy a command");
    expect(many).not.toContain("<select");

    const one = render({ selection: null });
    expect(one).toContain("Local address");
    expect(one).toContain("Not on one.");
    expect(one).not.toContain("<select");

    const none = render({
      addresses: { addresses: [], chosen: null, current: null },
      selection: null,
    });
    expect(none).toContain("this computer only");
    expect(none).toContain("a link works only on this computer");
    expect(none).not.toContain("Copy a link");
  });

  it("says the time a link has left and when a device joined", () => {
    expect(linkTimeLeft(NOW + 600_000, NOW)).toBe("10:00");
    expect(linkTimeLeft(NOW + 1_500, NOW)).toBe("0:02");
    expect(linkTimeLeft(NOW - 5_000, NOW)).toBe("0:00");
    expect(joinedWhen(AIR.pairedAt, NOW)).toMatch(/^today /);
    expect(joinedWhen(AIR.pairedAt - 24 * 3600_000, NOW)).toMatch(/^yesterday /);
    expect(joinedWhen(AIR.pairedAt - 3 * 24 * 3600_000, NOW)).not.toMatch(/^(today|yesterday)/);
    const never: DeviceView = { id: "air", kind: "work", name: "Mac", pairedAt: AIR.pairedAt };
    expect(deviceIdentity(never, NOW)).toMatch(/^a computer · joined today [^·]*$/);
    expect(deviceStatus(never, NOW)).toEqual({ text: "out of reach", tone: "warn" });
  });

  it("clears the joined note once that Mac has a sign-in, and not before", () => {
    const panel = {
      state: "joined" as const,
      line: "Mac mini joined your devices. It has git and Claude Code, and no sign-ins yet.",
      work: true,
      deviceId: "mini",
      awaitingSignIn: true,
    };
    const signedIn = {
      deviceId: "mini",
      name: "Mac mini",
      onThisMac: false,
      inReach: true,
      signIns: {
        providers: [],
        accounts: [{ id: "acct" }],
        quota: null,
      },
    } as unknown as DeviceSignIns;
    expect(joinedNoticeClears(panel, [])).toBe(false);
    expect(joinedNoticeClears(panel, [{ ...signedIn, signIns: null }])).toBe(false);
    expect(joinedNoticeClears(panel, [signedIn])).toBe(true);
    expect(joinedNoticeClears({ ...panel, awaitingSignIn: false }, [signedIn])).toBe(false);
    expect(joinedNoticeClears({ ...panel, deviceId: "other" }, [signedIn])).toBe(false);
  });

  it("says a device joined in the same words on the panel and in the feed", () => {
    for (const kind of ["view", "work"] as const)
      expect(
        feedLineFrom({ type: "device_joined", deviceId: "air", name: "MacBook Air", kind })?.text,
      ).toBe(deviceJoinedLine({ name: "MacBook Air", kind }));
    expect(
      feedLineFrom({
        type: "device_joined",
        deviceId: "mini",
        name: "Mac mini",
        kind: "work",
        user: "sam",
        onThisMac: false,
        found: { git: true, claudeCode: true },
      })?.text,
    ).toBe("Mac mini joined your devices. It has git and Claude Code, and no sign-ins yet.");
    expect(
      feedLineFrom({
        type: "device_joined",
        deviceId: "builder",
        name: "MacBook Pro",
        kind: "work",
        user: "builder",
        onThisMac: true,
      })?.text,
    ).toBe("Running as Builder is set up. It runs work only, and has no sign-ins yet.");
    // One already on the list that found this Mac again with a new command.
    expect(
      feedLineFrom({
        type: "device_joined",
        deviceId: "mini",
        name: "Mac mini",
        kind: "work",
        user: "sam",
        onThisMac: false,
        found: { git: true, claudeCode: true },
        again: true,
      })?.text,
    ).toBe("Mac mini found this computer again. It runs work as before.");
    expect(
      feedLineFrom({
        type: "device_joined",
        deviceId: "builder",
        name: "MacBook Pro",
        kind: "work",
        user: "builder",
        onThisMac: true,
        again: true,
      })?.text,
    ).toBe("Running as Builder found this computer again. It runs work as before.");
    // A phone, a view, never runs work (INF-64 piece 1).
    expect(
      feedLineFrom({
        type: "device_joined",
        deviceId: "pocket",
        name: "Kun's iPhone",
        kind: "view",
        onThisMac: false,
        again: true,
      })?.text,
    ).toBe("Kun's iPhone found this computer again. It can control your first mate.");
  });
});

/**
 * INF-318, the captain's "my wifi went down for a bit, but now this screen
 * shows a conflicting state": a refusal that says a computer did not answer
 * goes once a later connection began, and no other refusal does.
 * Piece D of INF-416: the line clears on `connectedAt` newer than the
 * refusal, not on a flag the screen kept of what it had seen.
 */
describe("a refusal after a network drop", () => {
  const at = 1_700_000_000_000;
  const MAC: DeviceView = {
    ...MINI,
    remoteLogin: "kunchen@mac-home",
    ssh: { state: "reconnecting" },
  };
  const back: DeviceView = {
    ...MAC,
    inReach: true,
    ssh: { state: "connected" },
    connectedAt: at + 1,
  };
  const answer = (refused: RemoteLoginRefusedAnswer["refused"]): RemoteLoginRefusedAnswer => ({
    refused,
    lines: [...remoteLoginWords.refused(refused, { address: "kunchen@mac-home", doing: "update" })],
  });
  const keptOf = (refused: RemoteLoginRefusedAnswer["refused"], address?: string) => {
    const kept = reachRefusalOf(answer(refused), MAC.id, at, address);
    if (!kept) throw new Error("a reach refusal is kept");
    return kept;
  };

  it("clears the line on a later connection", () => {
    const kept = keptOf("unreachable");
    expect(reachRefusalAfter(kept, [MAC])).toBe(false);
    expect(reachRefusalAfter(kept, [{ ...back, connectedAt: at }])).toBe(false);
    expect(reachRefusalAfter(kept, [back])).toBe(true);
  });

  it("goes for a computer on another version once that connection began after the refusal", () => {
    const kept = keptOf("out-of-reach");
    const older: DeviceView = {
      ...MAC,
      ssh: { state: "reconnecting" },
      otherVersion: { takesWork: false, updateBy: "command" } as DeviceView["otherVersion"],
      connectedAt: at + 1,
    };
    expect(reachRefusalAfter(kept, [older])).toBe(true);
  });

  it("stays while the connection that was up when the refusal came is still the one connected", () => {
    const kept = keptOf("unreachable");
    const same = { ...back, connectedAt: at - 1 };
    expect(reachRefusalAfter(kept, [same])).toBe(false);
    expect(reachRefusalAfter(kept, [MAC])).toBe(false);
    expect(reachRefusalAfter(kept, [back])).toBe(true);
  });

  it("goes when the computer is removed from the list", () => {
    expect(reachRefusalAfter(keptOf("unreachable"), [AIR])).toBe(true);
  });

  it("keeps no record of a refusal that is not about reaching it, so it stays until the next action", () => {
    for (const refusal of ["busy", "cannot-send", "current", "not-updatable", "failed"] as const)
      expect(reachRefusalOf(answer(refusal), MAC.id, at), refusal).toBeNull();
  });

  it("for Change address, goes only when a later connection is at the address that was tried", () => {
    const kept = keptOf("unreachable", "kunchen@studio.local");
    // Connected again at the old address: the tried one still did not answer.
    expect(reachRefusalAfter(kept, [back])).toBe(false);
    const moved: DeviceView = { ...back, remoteLogin: "kunchen@studio.local" };
    expect(reachRefusalAfter(kept, [moved])).toBe(true);
  });
});

// INF-1617, approved INF-1575: unsupported startup never becomes a login promise,
// and explicit work reachability remains a separate fact.
describe("unsupported Linux automatic startup", () => {
  it("keeps the device and its reachability while correcting both join-route rows", () => {
    for (const remoteLogin of [undefined, "sam@ubuntu-box"] as const) {
      const device: DeviceView = {
        ...MINI,
        name: "ubuntu-box",
        system: "linux",
        automaticStartup: "unavailable",
        ...(remoteLogin
          ? { remoteLogin, ssh: { state: "at-login" } }
          : { heldOnLocalNetwork: true }),
      };
      for (const inReach of [false, true]) {
        const markup = render({ devices: [{ ...device, inReach }] });
        expect(markup).toContain("automatic startup not set up");
        expect(markup).toContain("This setup does not start work at login.");
        expect(markup).not.toContain("starts the next time");
        expect(markup).not.toContain("data-device-held");
        expect(markup).toContain(`data-device-row="${device.id}"`);
        expect(deviceIdentity({ ...device, inReach }, NOW)).toContain(
          "automatic startup not set up",
        );
      }
    }
  });
  it("says an unreadable startup check is unknown, not a future login", () => {
    const markup = render({ devices: [{ ...MINI, automaticStartup: "unknown" }] });
    expect(markup).toContain("automatic startup not checked");
    expect(markup).toContain("Infinitary could not check automatic startup here.");
    expect(markup).not.toContain("starts the next time");
  });
});
