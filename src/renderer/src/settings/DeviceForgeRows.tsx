import { awayWord } from "@shared/devices";
import { kindByName } from "@shared/forge";
import { keyFormStartHost } from "@shared/forgeKinds";
import { FORGE_CLI_WORDS, type ForgeServerView } from "@shared/forges";
import * as m from "@shared/i18n/messages.generated";
import type { ComputerForges, DeviceSignIns } from "@shared/signIns";
import { REMOTE_SIGN_IN_UPDATE_NOTE, signInPlace } from "@shared/signIns";
import { useCallback, useEffect, useState } from "react";
import { useShellStore } from "../app/store";
import { Badge, Button, RowMenu, StatusDot, type StatusDotTone } from "../design";
import { useOverflowTitle } from "../design/core/overflowTitle";
import { useFirstMatePlace } from "../devices/useFirstMatePlace";
import { DeviceSignInAside, type Flow, SignInNeedsUpdate } from "./DeviceSignIns";
import { deviceSignInWaitLine } from "./DeviceSignInWait";
import { DEVICE_FORGE_WORDS } from "./deviceForgeWords";
import { ForgeBrowserAside } from "./ForgeBrowserAside";
import { HostChip, KeyAside, type KeyForm } from "./ForgeSection";
import { GitHubCliLine } from "./GitHubCliLine";
import { useDeviceSignIns } from "./useDeviceSignIns";

/**
 * Settings -> Integrations, for each computer that runs work (design skill
 * `components/devices/SignInOnAMac`, "GitHub on another device";
 * docs/forge.md, "A computer's own sign-in"): under this computer's own
 * connections, a row per computer and host - "GitHub · octo" over "Mac mini
 * · clones and pushes its own work", or the computer's name over "not signed
 * in to GitHub" with a Sign in. The host's device flow runs on that
 * computer: its code to read is drawn in the aside under the row, and that
 * computer finishes the sign-in itself.
 *
 * A computer that signs in to GitLab and GitHub Enterprise from here
 * (`servers`) has a chip for each kind after its rows, "GitLab on Mac mini":
 * GitLab's browser code runs there like GitHub's, and a key typed here goes
 * there once and is kept only there. Each host it signs in to gets its row.
 *
 * A computer that controls the first mate draws it the same way, for that
 * first mate's computers (docs/view.md, "Settings on a view").
 */

export type DeviceForgeRow = {
  deviceId: string;
  host: string;
  /** The person's word for the host ("GitHub"). */
  hostName: string;
  place: ReturnType<typeof signInPlace>;
  inReach: boolean;
  /** Out of reach only because its connection is being made. */
  connecting: boolean;
  /** The home follows its computer's update (`DeviceSignIns.updating`): it reads updating. */
  updating?: true;
  /** Its sign-in there, or null when it has none. */
  signIn: ComputerForges["signIns"][number] | null;
  /** That computer has GitHub CLI, so its GitHub sign-in may use GitHub CLI's (docs/forge.md, "A computer's own sign-in"). */
  githubCli: boolean;
  /** A host signed in to by its address, with its kind; absent for a host that signs in with a code. */
  server?: ForgeServerView;
};

/** One row per computer and host it offers, from what each computer last said of itself. */
export function deviceForgeRows(devices: DeviceSignIns[]): DeviceForgeRow[] {
  return devices.flatMap((device) => {
    const forges = device.signIns?.forges;
    if (!forges) return [];
    return forges.hosts.map((host) => ({
      deviceId: device.deviceId,
      host: host.host,
      hostName: host.name,
      place: signInPlace(device),
      inReach: device.reach === "in-reach",
      connecting: device.reach === "connecting",
      ...(device.updating ? { updating: true as const } : {}),
      signIn: forges.signIns.find((entry) => entry.host === host.host) ?? null,
      githubCli:
        forges.githubCli === true && (host.server?.kind ?? kindByName(host.host)) === "github",
      ...(host.server ? { server: host.server } : {}),
    }));
  });
}

/** The row's dot, title and mono line, from its sign-in's health and where it runs. */
export function deviceForgeRowView(row: DeviceForgeRow): {
  tone: StatusDotTone;
  label: string;
  title: string;
  line: string;
  reauth: boolean;
} {
  const away = row.inReach && !row.updating ? "" : ` · ${awayWord(row.connecting, row.updating)}`;
  if (!row.signIn)
    return {
      tone: "idle",
      label: m.settingsForgeNotSignedIn({ host: row.hostName }),
      title: row.place.label,
      line: `${m.settingsForgeNotSignedIn({ host: row.hostName })}${away}`,
      reauth: false,
    };
  const title = row.signIn.login ? `${row.hostName} · ${row.signIn.login}` : row.hostName;
  const through = row.signIn.way === "cli" ? ` · ${FORGE_CLI_WORDS.through}` : "";
  const line = `${row.place.label}${through} · ${DEVICE_FORGE_WORDS.deviceRole}${away}`;
  switch (row.signIn.state) {
    case "ok":
      return { tone: "ok", label: m.settingsForgeSignedIn(), title, line, reauth: false };
    case "needs_reauth":
      return {
        tone: "danger",
        label: m.settingsForgeSignInAgainState(),
        title,
        line,
        reauth: true,
      };
    case "unavailable":
      return {
        tone: "ring",
        label: m.settingsForgeSignedInUnreachable({ host: row.hostName }),
        title,
        line,
        reauth: false,
      };
    default:
      return { tone: "ring", label: m.settingsForgeSignedInChecking(), title, line, reauth: false };
  }
}

/** The kinds of server a computer signs in to from here, each as its chip names it. */
export function deviceForgeServers(device: DeviceSignIns): ForgeServerView[] {
  return device.signIns?.forges?.servers ?? [];
}

/** A server sign-in open for one computer: which, and the form on screen. */
type DeviceKeyForm = KeyForm & { deviceId: string };

/**
 * The computers' rows, below this computer's own connections. `onAny` says
 * whether any draws, so the box is not called empty.
 */
export function DeviceForgeRows({ onAny }: { onAny?: (any: boolean) => void } = {}) {
  const devices = useDeviceSignIns();
  const home = useFirstMatePlace();
  const rows = deviceForgeRows(devices);
  const [form, setForm] = useState<DeviceKeyForm | null>(null);
  const any =
    rows.length > 0 ||
    devices.some((device) => !device.signIns || deviceForgeServers(device).length > 0);
  useEffect(() => {
    onAny?.(any);
  }, [any, onAny]);

  const signIn = useCallback(
    (row: DeviceForgeRow) => {
      if (!devices.find((device) => device.deviceId === row.deviceId)?.flows) return;
      // A host signed in to by its address signs in again the same way.
      if (row.server) {
        setForm({ deviceId: row.deviceId, host: row.host, server: row.server });
        return;
      }
      setForm(null);
      void window.infinitary.devices.forgeSignIn(row.deviceId, row.host).catch(() => {});
    },
    [devices],
  );

  // The host's card for a computer that needs its own sign-in lands here,
  // in Settings -> Integrations, with that sign-in to start, so the code -
  // or, for GitLab or GitHub Enterprise, its form - is on screen when the
  // tab opens (docs/forge.md, "A computer's own sign-in").
  const pending = useShellStore((s) => s.pendingDeviceForgeSignIn);
  useEffect(() => {
    if (!pending) return;
    const device = devices.find((entry) => entry.deviceId === pending.deviceId);
    if (device && device.reach !== "in-reach") {
      useShellStore.getState().clearPendingDeviceForgeSignIn();
      return;
    }
    if (!device?.flows) return;
    const row = rows.find(
      (entry) => entry.deviceId === pending.deviceId && entry.host === pending.host,
    );
    if (row) {
      useShellStore.getState().clearPendingDeviceForgeSignIn();
      if ((!row.signIn || row.server) && row.inReach) signIn(row);
      return;
    }
    const servers = deviceForgeServers(device);
    if (servers.length === 0) return;
    useShellStore.getState().clearPendingDeviceForgeSignIn();
    // A host it has no row for yet is one of the kinds it signs in to by an
    // address: gitlab.com by its name, another host by the kind this
    // computer's own projects there are stamped with.
    const host = pending.host;
    const named = kindByName(host);
    const open = (kind: string | undefined) => {
      const server = servers.find((entry) => entry.kind === kind) ?? servers[0];
      if (server) setForm({ deviceId: device.deviceId, host, server });
    };
    if (named) open(named);
    else
      void window.infinitary.forges
        .list()
        .then((view) =>
          open([...view.hosts, ...view.signIns].find((entry) => entry.host === host)?.server?.kind),
        )
        .catch(() => open(undefined));
  }, [pending, rows, devices, signIn]);

  const stop = (flow: Flow) => {
    void window.infinitary.devices.cancelSignIn(flow.signInId).catch(() => {});
  };

  /** The form for a server sign-in on that computer, under its row or its chips. */
  const formFor = (device: DeviceSignIns, open: DeviceKeyForm) => {
    const place = signInPlace(device);
    const close = () => setForm(null);
    if (open.server.browser && open.method !== "key")
      return (
        <ForgeBrowserAside
          key={`browser:${open.deviceId}:${open.host}`}
          address={open.host}
          applicationId={
            device.signIns?.forges?.signIns.find((entry) => entry.host === open.host)?.applicationId
          }
          server={open.server}
          ended={null}
          onDone={close}
          onKey={(host) => setForm({ ...open, host, method: "key" })}
          onCancel={close}
          computer={{
            who: place.who,
            start: (input) =>
              window.infinitary.devices.forgeSignInWithBrowser(open.deviceId, input),
          }}
        />
      );
    return (
      <KeyAside
        key={`key:${open.deviceId}:${open.server.kind}:${open.host}`}
        form={open}
        githubCli={device.signIns?.forges?.githubCli === true && open.server.kind === "github"}
        onDone={close}
        onCancel={close}
        onBrowser={
          open.server.browser ? (host) => setForm({ ...open, host, method: undefined }) : undefined
        }
        computer={{
          who: place.who,
          where: place.where,
          signIn: (input) => window.infinitary.devices.forgeSignInWithKey(open.deviceId, input),
          cli: (host) => window.infinitary.devices.forgeSignInWithCli(open.deviceId, host),
        }}
      />
    );
  };

  return (
    <>
      {devices.map((device) => {
        const own = rows.filter((row) => row.deviceId === device.deviceId);
        const servers = deviceForgeServers(device);
        const flows = device.flows;
        const place = signInPlace(device);
        if (!device.signIns) {
          const line = deviceSignInWaitLine(device, home.this);
          return (
            <div key={device.deviceId}>
              <div className="fm-forges-row" data-device-forge-wait={device.deviceId}>
                <span className="fm-forges-dot" aria-hidden="true">
                  <StatusDot tone="idle" label={line} />
                </span>
                <span className="fm-forges-name">{place.label}</span>
                <span className="fm-forges-who">
                  <span className="fm-forges-sub">{line}</span>
                </span>
              </div>
            </div>
          );
        }
        const listed = new Set(own.map((row) => row.host));
        // A browser code for a host it has no row for yet draws under its chips.
        const loose = flows?.filter(
          (entry) => entry.target === "forge" && !listed.has(entry.providerId),
        );
        const formHere = form?.deviceId === device.deviceId ? form : null;
        const formUnderRow = formHere && listed.has(formHere.host) ? formHere : null;
        return (
          <div key={device.deviceId} style={{ display: "contents" }}>
            {own.map((row) => {
              const key = `${row.deviceId}:${row.host}`;
              const flow = flows?.find(
                (entry) => entry.target === "forge" && entry.providerId === row.host,
              );
              const starting = Boolean(flow && !flow.notice && !flow.ended);
              return (
                <div key={key}>
                  <DeviceForgeRowLine
                    row={row}
                    starting={starting}
                    open={Boolean(flow) || formUnderRow?.host === row.host}
                    signInOff={!flows ? REMOTE_SIGN_IN_UPDATE_NOTE : undefined}
                    onSignIn={() => signIn(row)}
                    onSignOut={() =>
                      void window.infinitary.devices
                        .forgeSignOut(row.deviceId, row.host)
                        .catch(() => {})
                    }
                  />
                  {!flows && <SignInNeedsUpdate />}
                  {flow && (
                    <DeviceSignInAside
                      flow={flow}
                      providerName={row.hostName}
                      place={row.place}
                      key={flow.signInId}
                      onAnswer={() => {}}
                      onStop={() => stop(flow)}
                    />
                  )}
                  {flow && row.githubCli && row.inReach && !row.server && (
                    // The code's alternative, as this computer's own GitHub sign-in
                    // offers it: that computer asks its own GitHub CLI, and its row
                    // turns signed in once it kept the sign-in.
                    <div className="fm-connect-aside" data-device-forge-cli={row.deviceId}>
                      <GitHubCliLine
                        address={row.host}
                        where={row.place.where}
                        ask={() =>
                          window.infinitary.devices.forgeSignInWithCli(row.deviceId, row.host)
                        }
                        onDone={() => stop(flow)}
                      />
                    </div>
                  )}
                  {formUnderRow?.host === row.host && formFor(device, formUnderRow)}
                </div>
              );
            })}
            {servers.length > 0 && flows && (
              <div className="fm-forges-add" data-device-forge-servers={device.deviceId}>
                <div className="fm-connect-chips">
                  {servers.map((server) => (
                    <HostChip
                      key={server.kind}
                      host={{
                        host: `${server.kind}@${device.deviceId}`,
                        name: `${server.name} ${place.where}`,
                      }}
                      busy={false}
                      onConnect={() =>
                        // GitLab opens on gitlab.com, whose address the person
                        // changes for their own server; GitHub Enterprise opens empty.
                        setForm({
                          deviceId: device.deviceId,
                          host: keyFormStartHost(server.kind),
                          server,
                        })
                      }
                    />
                  ))}
                </div>
                {loose?.map((flow) => (
                  <DeviceSignInAside
                    flow={flow}
                    providerName={flow.providerId}
                    place={place}
                    key={flow.signInId}
                    onAnswer={() => {}}
                    onStop={() => stop(flow)}
                  />
                ))}
                {formHere && !formUnderRow && formFor(device, formHere)}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function DeviceForgeRowLine({
  row,
  starting,
  open,
  onSignIn,
  onSignOut,
  signInOff,
}: {
  row: DeviceForgeRow;
  /** Asked there, and no code back yet. */
  starting: boolean;
  /** Its aside is open: one sign-in at a time. */
  open: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  signInOff?: string;
}) {
  const view = deviceForgeRowView(row);
  const notSignedIn = !row.signIn;
  const lineFit = useOverflowTitle(notSignedIn ? view.line : undefined);
  // Signed in, or asked to sign in again, the dot's word is drawn beside it.
  const nativeTitle =
    row.signIn?.state !== "ok" &&
    row.signIn?.state !== "needs_reauth" &&
    !(notSignedIn && view.line.startsWith(view.label) && !lineFit.hidden);
  return (
    <div
      className="fm-forges-row"
      data-device-forge-row={row.deviceId}
      data-forge-host={row.host}
      data-forge-state={row.signIn?.state ?? "none"}
    >
      <span className="fm-forges-dot">
        <StatusDot tone={view.tone} label={view.label} nativeTitle={nativeTitle} focusable />
      </span>
      <span className="fm-forges-name">{view.title}</span>
      <span className="fm-forges-who">
        {row.signIn &&
          (view.reauth ? (
            <span className="fm-forges-state" data-tone="danger">
              {m.settingsForgeSignInAgainSay()}
            </span>
          ) : (
            <Badge tone="ok">{m.settingsForgeSignedIn()}</Badge>
          ))}
        <span className="fm-forges-sub" ref={notSignedIn ? lineFit.ref : undefined}>
          {view.line}
        </span>
      </span>
      <span className="fm-forges-action">
        {(!row.signIn || view.reauth) && (
          <Button
            variant={view.reauth ? "primary" : "secondary"}
            size="sm"
            pending={starting}
            pendingLabel={m.settingsForgeStarting()}
            disabled={!row.inReach || open}
            off={Boolean(signInOff)}
            note={signInOff}
            onClick={onSignIn}
          >
            {view.reauth ? m.settingsForgeSignInAgain() : m.settingsForgeSignIn()}
          </Button>
        )}
      </span>
      <span className="fm-forges-menu">
        {row.signIn && (
          <RowMenu
            label={m.settingsForgeRowActions({ host: row.hostName, where: row.place.where })}
            items={[
              {
                id: "sign-out",
                label: m.settingsForgeSignOut(),
                tone: "danger",
                onSelect: onSignOut,
              },
            ]}
          />
        )}
      </span>
    </div>
  );
}
