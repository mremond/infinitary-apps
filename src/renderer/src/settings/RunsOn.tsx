import { AUTOMATIC_COMPUTER, AUTOMATIC_WORD } from "@shared/placement";
import { type RepoView, runsHereOnly } from "@shared/repos";
import { type DeviceSignIns, signInPlace } from "@shared/signIns";
import { useEffect, useState } from "react";
import "./devices.css";
import { awayWord } from "@shared/devices";
import * as m from "@shared/i18n/messages.generated";
import { useFirstMatePlace } from "../devices/useFirstMatePlace";

/**
 * A project's Runs on (design skill `components/devices/RunsOn`;
 * docs/helper.md, "Runs on"): where its next task starts, this Mac or a
 * computer that runs work. Settings -> Projects draws it only on the Mac
 * where Firstmate lives, once such a computer is on the list; with none, a
 * project's row is as it was.
 */

/**
 * The computers that run work, as the home last heard each, or null where
 * the first mate offers no Devices. Follows every change the home pushes.
 */
export function useWorkComputers(): DeviceSignIns[] | null {
  const [computers, setComputers] = useState<DeviceSignIns[] | null>(null);
  useEffect(() => {
    let live = true;
    let shown = false;
    void window.infinitary.devices
      .shown()
      .then(({ shown: offered }) => {
        if (!live || !offered) return;
        shown = true;
        void window.infinitary.devices.signIns().then((next) => live && setComputers(next));
      })
      .catch(() => {});
    const off = window.infinitary.devices.onSignIns((next) => {
      if (shown) setComputers(next);
    });
    return () => {
      live = false;
      off();
    };
  }, []);
  return computers;
}

/** Why a computer cannot take work now, after a middle dot, or nothing. */
function notNow(computer: DeviceSignIns): string {
  if (computer.updating) return ` · ${awayWord(false, true)}`;
  if (!(computer.reach === "in-reach")) return ` · ${awayWord(computer.reach === "connecting")}`;
  if (computer.signIns && computer.signIns.accounts.length === 0)
    return ` · ${m.settingsRunsOnNoSignIns()}`;
  return "";
}

/** The row's place words live with the row's other words, which the phone runs too. */
export { runsOnWhere } from "./projectsWords";

/** The control in the Runs on row: one select, or "This Mac" as text where only this Mac can run it. */
export function RunsOnControl({
  repo,
  computers,
  onChoose,
}: {
  repo: RepoView;
  computers: readonly DeviceSignIns[];
  onChoose: (deviceId: string | null) => void;
}) {
  const place = useFirstMatePlace();
  if (runsHereOnly(repo))
    return <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-3)" }}>{place.This}</span>;
  const macs = computers.filter((computer) => !computer.onThisMac);
  const users = computers.filter((computer) => computer.onThisMac);
  const gone =
    repo.runsOn &&
    repo.runsOn !== AUTOMATIC_COMPUTER &&
    !computers.some((computer) => computer.deviceId === repo.runsOn);
  const option = (computer: DeviceSignIns) => (
    <option key={computer.deviceId} value={computer.deviceId}>
      {signInPlace(computer).label}
      {notNow(computer)}
    </option>
  );
  return (
    <select
      aria-label={m.settingsRunsOnLabel()}
      className="fm-runs-on"
      value={repo.runsOn ?? ""}
      onChange={(event) => onChoose(event.target.value || null)}
    >
      <option value={AUTOMATIC_COMPUTER}>{AUTOMATIC_WORD}</option>
      <option value="">{place.This}</option>
      {macs.length > 0 && (
        <optgroup label={m.settingsRunsOnYourComputers()}>{macs.map(option)}</optgroup>
      )}
      {users.length > 0 && (
        <optgroup label={m.settingsRunsOnAnotherUser()}>{users.map(option)}</optgroup>
      )}
      {gone && repo.runsOn && <option value={repo.runsOn}>{m.settingsRunsOnRemoved()}</option>}
    </select>
  );
}

/** The row's description, in the design's words. */
export function runsOnDescription(repo: RepoView): string {
  if (repo.runsOn === AUTOMATIC_COMPUTER) return m.settingsRunsOnAutomaticDescription();
  return runsHereOnly(repo) ?? m.settingsRunsOnDescription();
}
