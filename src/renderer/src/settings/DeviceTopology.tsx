import { type DeviceView, deviceLabel, deviceRunsWork, reachFrom } from "@shared/devices";
import { formatNumber } from "@shared/i18n/format";
import * as m from "@shared/i18n/messages.generated";
import {
  type CSSProperties,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { focusWithRing } from "../design/focus";
import "./deviceTopology.css";

type Point = readonly [number, number];
const center: Point = [0.5, 0.5];
// Stable seats in reading order; the same point anchors a button and its edge.
const wide: Point[] = [
  [0.17, 0.18],
  [0.5, 0.18],
  [0.83, 0.18],
  [0.15, 0.5],
  [0.85, 0.5],
  [0.17, 0.82],
  [0.5, 0.82],
  [0.83, 0.82],
];
const seats: Record<number, Point[]> = {
  8: wide,
  6: [
    [0.2, 0.18],
    [0.8, 0.18],
    [0.17, 0.5],
    [0.83, 0.5],
    [0.2, 0.82],
    [0.8, 0.82],
  ],
  4: [
    [0.24, 0.18],
    [0.76, 0.18],
    [0.24, 0.82],
    [0.76, 0.82],
  ],
  2: [
    [0.5, 0.18],
    [0.5, 0.82],
  ],
};
const height = 380;

export function deviceContact(device: DeviceView) {
  if (device.controlling) return "live";
  const reach = reachFrom(device);
  if (reach === "in-reach") return "live";
  // A computer being updated is coming back, never away (`computer-updating`).
  return reach === "out-of-reach" && !device.updating ? "away" : "trying";
}

function contactWord(contact: ReturnType<typeof deviceContact>) {
  return contact === "live"
    ? m.settingsDevicesMapLive()
    : contact === "trying"
      ? m.settingsDevicesMapTrying()
      : m.settingsDevicesMapAway();
}

function deviceStatus(device: DeviceView, contact: ReturnType<typeof deviceContact>): string {
  if (contact === "live" && deviceRunsWork(device.kind)) {
    if (device.otherVersion?.takesWork === false) return m.settingsDevicesMapNoNewWork();
    if (device.controlling && !device.inReach) return m.settingsDevicesMapWorkNotReady();
  }
  if (contact === "trying") {
    if (device.updating) return m.settingsDevicesMapUpdating();
    if (reachFrom(device) === "reconnecting" && device.seenAt !== undefined)
      return m.settingsDevicesMapReconnectingSsh();
    return m.settingsDevicesMapConnectingSsh();
  }
  return contactWord(contact);
}

// An active retry exposes the missing work response, not a specific failure cause.
function retryDetail(device: DeviceView): string | null {
  return deviceContact(device) === "trying" &&
    !device.updating &&
    reachFrom(device) === "reconnecting"
    ? m.settingsDevicesMapWaitingForWork()
    : null;
}

export function DeviceTopology({
  home,
  peers,
  selected,
  progressFor,
  onSelect,
}: {
  home: string;
  peers: readonly DeviceView[];
  selected: string | null;
  progressFor: (device: DeviceView) => string | null;
  onSelect: (id: string | null) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const mapButton = useRef<HTMLButtonElement>(null);
  const listButton = useRef<HTMLButtonElement>(null);
  const pager = useRef<HTMLDivElement>(null);
  const moveControlFocus = useCallback((includeMap: boolean) => {
    const list = listButton.current;
    const active = list?.ownerDocument.activeElement;
    if (
      list &&
      active &&
      (pager.current?.contains(active) || (includeMap && active === mapButton.current))
    )
      focusWithRing(list, { preventScroll: true });
  }, []);
  const bindPager = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) moveControlFocus(false);
      pager.current = node;
    },
    [moveControlFocus],
  );
  const [blockedMap, setBlockedMap] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [layout, setLayout] = useState<"map" | "list">("map");
  const [pageStart, setPageStart] = useState(0);
  const [turn, setTurn] = useState(false);
  useEffect(() => {
    const node = root.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const next = entry?.contentRect.width ?? 0;
      if (next > 0 && next < 190) moveControlFocus(true);
      setWidth(next);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [moveControlFocus]);
  const size = width >= 710 ? 8 : width >= 530 ? 6 : width >= 370 ? 4 : 2;
  const last = Math.max(0, Math.ceil(peers.length / size) - 1);
  const page = Math.min(last, Math.floor(pageStart / size));
  const active = peers.findIndex((peer) => peer.id === selected);
  // Follow a selection made in List or from a card. Browsing a different page
  // does not change the inspector or implicitly select a different computer.
  useEffect(() => {
    if (active >= 0) setPageStart(active);
  }, [active]);
  const pagePeers = peers.slice(page * size, (page + 1) * size);
  const mapKey = JSON.stringify([
    width,
    home,
    pagePeers.map((device) => [
      device.id,
      deviceStatus(device, deviceContact(device)),
      retryDetail(device),
      progressFor(device),
    ]),
  ]);
  const mapFits = (width === 0 || width >= 190) && blockedMap !== mapKey;
  const map = layout === "map" && mapFits;
  const shown = map ? pagePeers : peers;
  useLayoutEffect(() => {
    if (width < 190 || blockedMap !== mapKey) return;
    const list = listButton.current;
    if (!list) return;
    const fonts = list.ownerDocument.fonts;
    const remeasure = () => {
      const focused = list.ownerDocument.activeElement;
      const deviceId = focused?.getAttribute("data-device-select");
      // An off-page List row unmounts on a map retry, but not in explicit List.
      if (
        layout === "map" &&
        focused &&
        deviceId &&
        deviceId !== "this-mac" &&
        stage.current?.contains(focused) &&
        !pagePeers.some((peer) => peer.id === deviceId)
      )
        focusWithRing(list, { preventScroll: true });
      setBlockedMap("");
    };
    fonts.addEventListener("loadingdone", remeasure);
    fonts.addEventListener("loadingerror", remeasure);
    return () => {
      fonts.removeEventListener("loadingdone", remeasure);
      fonts.removeEventListener("loadingerror", remeasure);
    };
  }, [blockedMap, layout, mapKey, pagePeers, width]);
  useLayoutEffect(() => {
    // A rejection applies only to the current map. If it returns later,
    // measure again so fallback can hand off focus before disabling Map.
    if (blockedMap && blockedMap !== mapKey) setBlockedMap("");
    const plot = stage.current;
    if (!map || !plot || width === 0 || typeof ResizeObserver === "undefined") return;
    const nodes = Array.from(plot.querySelectorAll("[data-device-select]"));
    const check = () => {
      const bounds = plot.getBoundingClientRect();
      // Include the focus outline (2 px) and offset (2 px), scaled with the stage.
      const ring = (4 * bounds.height) / height;
      const tiles = nodes.map((node) => node.getBoundingClientRect());
      if (
        tiles.some(
          (tile, i) =>
            tile.left - ring < bounds.left ||
            tile.right + ring > bounds.right ||
            tile.top - ring < bounds.top ||
            tile.bottom + ring > bounds.bottom ||
            tiles
              .slice(0, i)
              .some(
                (other) =>
                  other.left - 2 * ring < tile.right &&
                  other.right + 2 * ring > tile.left &&
                  other.top - 2 * ring < tile.bottom &&
                  other.bottom + 2 * ring > tile.top,
              ),
        )
      ) {
        moveControlFocus(true);
        setBlockedMap(mapKey);
      }
    };
    check();
    const observer = new ResizeObserver(check);
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [blockedMap, map, mapKey, moveControlFocus, width]);
  const positions = seats[size] ?? wide;
  const shiftFocus = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    const buttons = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    );
    const index = buttons.indexOf(event.currentTarget);
    if (index < 0) return;
    event.preventDefault();
    const next = buttons[(index + step + buttons.length) % buttons.length];
    if (next) focusWithRing(next);
  };
  const select = (id: string | null) => {
    if (id === null) setTurn(true);
    onSelect(id);
  };
  const node = (device: DeviceView | null, point: Point) => {
    const contact = device ? deviceContact(device) : null;
    const label = device ? deviceLabel(device) : home;
    const state = device && contact ? deviceStatus(device, contact) : m.settingsDevicesMapHome();
    const progress = device ? progressFor(device) : null;
    const waitingForWork = device ? retryDetail(device) : null;
    return (
      <button
        key={device?.id ?? ""}
        type="button"
        className="fm-topology-node"
        style={
          { "--node-x": `${point[0] * 100}%`, "--node-y": `${point[1] * 100}%` } as CSSProperties
        }
        data-device-select={device?.id ?? "this-mac"}
        aria-pressed={selected === (device?.id ?? null)}
        title={label}
        onKeyDown={shiftFocus}
        onClick={() => select(device?.id ?? null)}
      >
        {device ? (
          <DeviceGlyph phone={device.system === "ios"} />
        ) : (
          <HomeGlyph turning={turn} onEnd={() => setTurn(false)} />
        )}
        <span className="fm-topology-name" dir="auto">
          {label}
        </span>
        <span className="fm-topology-state" data-contact={contact}>
          {state}
          {waitingForWork && <span className="fm-topology-progress">{waitingForWork}</span>}
          {progress && progress !== state && (
            <span className="fm-topology-progress">{progress}</span>
          )}
        </span>
      </button>
    );
  };
  return (
    <div ref={root} className="fm-topology" data-device-topology="">
      <div className="fm-topology-bar">
        <span className="fm-topology-count">
          {m.settingsDevicesMapCount({
            count: formatNumber(peers.filter((device) => deviceContact(device) === "live").length),
            total: formatNumber(peers.length),
          })}
        </span>
        <fieldset className="fm-topology-switch" aria-label={m.settingsDevicesMapLayout()}>
          <button
            ref={mapButton}
            type="button"
            aria-pressed={map}
            disabled={!mapFits}
            onClick={() => setLayout("map")}
          >
            {m.settingsDevicesMapMode()}
          </button>
          <button
            ref={listButton}
            type="button"
            aria-pressed={!map}
            onClick={() => setLayout("list")}
          >
            {m.settingsDevicesListMode()}
          </button>
        </fieldset>
      </div>
      <div ref={stage} className="fm-topology-stage" data-layout={map ? "map" : "list"}>
        {map && width > 0 && (
          <svg className="fm-topology-edges" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
            <ellipse cx={width / 2} cy={height / 2} rx={width * 0.38} ry={129} />
            <ellipse cx={width / 2} cy={height / 2} rx={width * 0.29} ry={95} />
            {shown.map((peer, i) => (
              <Edge
                key={peer.id}
                width={width}
                point={positions[i] ?? center}
                contact={deviceContact(peer)}
              />
            ))}
          </svg>
        )}
        {node(null, center)}
        {shown.map((peer, i) => node(peer, positions[i] ?? center))}
      </div>
      {map && (
        <div className="fm-topology-foot">
          <div className="fm-topology-legend">
            {(["live", "trying", "away"] as const).map((contact) => (
              <span key={contact}>
                <svg viewBox="0 0 22 8" aria-hidden="true">
                  <LinkStroke end={[22, 4]} start={[0, 4]} contact={contact} />
                </svg>
                {contactWord(contact)}
              </span>
            ))}
          </div>
          {last > 0 && (
            <div ref={bindPager} className="fm-topology-pager">
              <button
                type="button"
                aria-disabled={page === 0}
                onClick={() => {
                  if (page > 0) setPageStart((page - 1) * size);
                }}
              >
                {m.settingsDevicesMapPrevious()}
              </button>
              <span aria-live="polite">
                {m.settingsDevicesMapPage({
                  page: formatNumber(page + 1),
                  total: formatNumber(last + 1),
                })}
              </span>
              <button
                type="button"
                aria-disabled={page >= last}
                onClick={() => {
                  if (page < last) setPageStart((page + 1) * size);
                }}
              >
                {m.settingsDevicesMapNext()}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DeviceGlyph({ phone }: { phone: boolean }) {
  return (
    <svg
      className="fm-topology-glyph"
      data-device-glyph={phone ? "handset" : "computer"}
      viewBox="0 0 32 24"
      aria-hidden="true"
    >
      {phone ? (
        <>
          <rect x="9" y="1" width="14" height="22" rx="3" />
          <path d="M14 4h4m-4 16h4" strokeLinecap="round" />
        </>
      ) : (
        <>
          <rect x="4" y="2" width="24" height="16" rx="2" />
          <path d="M16 18v4m-6 0h12M7 14h18" />
        </>
      )}
    </svg>
  );
}

// An oblique projection of the two cubes and eight joins of a tesseract.
const corners: Point[] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];
const vertices = [13, 7].flatMap((radius) =>
  [0, 1].flatMap((rear) =>
    corners.map(
      ([x, y]) =>
        [
          32 + x * radius + (rear ? 7 : -7),
          29 + y * radius + (rear ? -6 : 6) + x * radius * 0.16,
        ] as Point,
    ),
  ),
);
const wires = vertices.flatMap((_, i) =>
  [(i & ~3) + ((i + 1) % 4), ...(i % 8 < 4 ? [i + 4] : []), ...(i < 8 ? [i + 8] : [])].map(
    (j) => [i, j] as const,
  ),
);

function line(start: Point, end: Point) {
  return `M${start[0]},${start[1]}L${end[0]},${end[1]}`;
}
function HomeGlyph({ turning, onEnd }: { turning: boolean; onEnd: () => void }) {
  return (
    <svg
      className="fm-topology-home"
      data-turn={turning}
      onAnimationEnd={onEnd}
      viewBox="0 0 64 58"
      aria-hidden="true"
    >
      {wires.map(([i, j]) => (
        <path
          key={`${i}-${j}`}
          opacity={i % 8 >= 4 ? 0.45 : 0.82}
          d={line(vertices[i] ?? center, vertices[j] ?? center)}
        />
      ))}
      {vertices.map(([x, y], i) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r={i < 4 ? 1.45 : 1.1}
          opacity={i % 8 >= 4 ? 0.55 : 1}
        />
      ))}
    </svg>
  );
}

function Edge({
  width,
  point,
  contact,
}: {
  width: number;
  point: Point;
  contact: ReturnType<typeof deviceContact>;
}) {
  const start: Point = [width / 2, height / 2];
  const end: Point = [width * point[0], height * point[1]];
  return <LinkStroke start={start} end={end} contact={contact} />;
}

function LinkStroke({
  start,
  end,
  contact,
}: {
  start: Point;
  end: Point;
  contact: ReturnType<typeof deviceContact>;
}) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy) || 1;
  const gap = Math.min(10, length * 0.2);
  const near: Point = [
    (start[0] + end[0]) / 2 - (gap * dx) / length,
    (start[1] + end[1]) / 2 - (gap * dy) / length,
  ];
  const far: Point = [near[0] + (2 * gap * dx) / length, near[1] + (2 * gap * dy) / length];
  const cap = ([x, y]: Point) =>
    line(
      [x - (2.6 * dy) / length, y + (2.6 * dx) / length],
      [x + (2.6 * dy) / length, y - (2.6 * dx) / length],
    );
  return (
    <path
      className="fm-topology-edge"
      data-contact={contact}
      d={
        contact === "away"
          ? line(start, near) + cap(near) + cap(far) + line(far, end)
          : line(start, end)
      }
    />
  );
}
