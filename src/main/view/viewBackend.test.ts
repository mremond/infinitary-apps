import { CONTRACT_CHANGES } from "@core/connection/contractChanges";
import { dialHome } from "@core/devices/dial";
import type { HomeLinkOptions, HomeLinkState } from "@core/devices/homeLink";
import { JoinedHome } from "@core/devices/joinedHome";
import type { UpdateChecker } from "@core/update/updateChecker";
import { withAnythingElse } from "@shared/cards";
import { customApiConnectInputSchema } from "@shared/customApi";
import { PROTOCOL_VERSION } from "@shared/ipc";
import type { PersonalSnapshot } from "@shared/personal/manifest";
import { DEFAULT_SHELL_PREFERENCES, type ShellPreferences } from "@shared/preferences";
import { afterEach, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { home } from "../../../tests/helpers/connectionHome";
import { scratchDir } from "../../../tests/helpers/scratchDirs";
import { PROJECT_ADVISORY_WORKFLOWS } from "./projectMoveReset";
import { ViewBackend } from "./viewBackend";

const views: ViewBackend[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.dispose();
});

const notUsed = (action: keyof UpdateChecker) => () => {
  throw new Error(`The update checker's ${action} is not used by this test.`);
};

/**
 * This Mac's own update checker, which no test here uses: a test that reaches one of its actions
 * fails saying so. It has no `follow`, `installFollowed` or `unfollow`, like a copy that cannot
 * follow the other Mac's version, because every view's dispose calls `unfollow` when it is there.
 */
const unusedUpdates: UpdateChecker = {
  getStatus: notUsed("getStatus"),
  checkNow: notUsed("checkNow"),
  setChannel: notUsed("setChannel"),
  openReleasePage: notUsed("openReleasePage"),
  install: notUsed("install"),
  later: notUsed("later"),
};

// Accepted token-command plan forbids silent fixed-key fallback; INF-3508 found
// optional-field stripping at an older home, on both local and work-account routes.
it("refuses command settings before forwarding to an old or unknown home, without changing fixed-key calls", async () => {
  let changes: HomeLinkState["homeChanges"] = null;
  let homeVersion: HomeLinkState["homeVersion"] = null;
  const invoke = vi.fn(async () => ({ listed: [] }));
  const state: HomeLinkState = {
    contact: "in-reach",
    access: "full",
    homeVersion: null,
    homeChanges: null,
    name: null,
    takesWork: null,
    onHomeMac: null,
    heardAt: null,
    removed: false,
  };
  const view = new ViewBackend({
    joined: new JoinedHome(scratchDir("view-command-")),
    record: {
      version: 1,
      grant: {
        at: "127.0.0.1:1",
        homeKey: "unused",
        deviceId: "view",
        kind: "view",
        key: "unused",
        cert: "unused",
      },
      name: null,
      joinedAt: 1,
    },
    broadcast: () => {},
    notifications: { supported: () => false, focused: () => true, show: () => {} },
    onThisMac: () => {},
    onRemoved: () => {},
    updates: unusedUpdates,
    link: () => ({
      start: () => {},
      state: () => ({ ...state, homeVersion, homeChanges: changes }),
      invoke: invoke as never,
      leave: async () => true,
      close: () => {},
    }),
  });
  views.push(view);
  const command = customApiConnectInputSchema.parse({
    label: "Company gateway",
    baseUrl: "https://gateway.example/v1",
    protocol: "anthropic-messages",
    key: "",
    noKey: false,
    headers: [],
    tokenCommand: { command: "company-token --audience claude", refreshSeconds: 300 },
    replaceAccountId: "existing-fixed-key",
    models: [],
    approvedDestination: "https://gateway.example/v1",
    unencryptedLocalApproved: false,
    allowStorageDefault: false,
    storageApproved: false,
  });
  const { tokenCommand: _command, ...fixed } = command;
  fixed.key = "disposable-fixed-key";
  for (const channel of ["inf:accounts:custom:connect", "inf:devices:custom:connect"] as const) {
    const args = (input: unknown) =>
      channel === "inf:accounts:custom:connect" ? [input] : ["work", input];
    // Before the home's welcome, and a home on major 15 that does not name the token command.
    for (const unsupported of [
      { version: null, changes: null },
      { version: "15.0.0", changes: [] },
      { version: "15.0.0", changes: ["font-choice", "sign-in-return"] },
    ]) {
      homeVersion = unsupported.version;
      changes = unsupported.changes;
      invoke.mockClear();
      await expect(view.dispatch(channel, args(command))).rejects.toThrow(
        "before saving a token command",
      );
      expect(invoke).not.toHaveBeenCalled();
      await expect(view.dispatch(channel, args(fixed))).resolves.toEqual({ listed: [] });
      expect(invoke).toHaveBeenCalledWith(channel, args(fixed));
    }
    // A home on major 15 that names it, and every home from major 16 on, which folded the name in.
    for (const supported of [
      { version: "15.0.0", changes: ["custom-token-command"] },
      { version: PROTOCOL_VERSION, changes: [] },
    ]) {
      homeVersion = supported.version;
      changes = supported.changes;
      invoke.mockClear();
      await expect(view.dispatch(channel, args(command))).resolves.toEqual({ listed: [] });
      expect(invoke).toHaveBeenCalledExactlyOnceWith(channel, args(command));
    }
  }
});

// INF-3750's option D: the home sends streamed reply pieces and tool starts and ends as `live` frames, and the
// window's crewmate transcript and Observe read them as events, as they did numbered. INF-3851's piece 3 sends the
// computers' readings live too, and the window's computer screens and panels read them as they did numbered.
it("hands a streamed reply piece and a computers' reading the home sent live to this Mac's windows", () => {
  const sent: [string, unknown][] = [];
  let hear: HomeLinkOptions["onLive"];
  const view = new ViewBackend({
    joined: new JoinedHome(scratchDir("view-live-")),
    record: {
      version: 1,
      grant: {
        at: "127.0.0.1:1",
        homeKey: "unused",
        deviceId: "view",
        kind: "view",
        key: "unused",
        cert: "unused",
      },
      name: null,
      joinedAt: 1,
    },
    broadcast: (channel, payload) => sent.push([channel, payload]),
    notifications: { supported: () => false, focused: () => true, show: () => {} },
    onThisMac: () => {},
    onRemoved: () => {},
    updates: unusedUpdates,
    link: (options) => {
      hear = options.onLive;
      return {
        start: () => {},
        state: () => ({
          contact: "in-reach",
          access: "full",
          // A home on this major, which has by its version what major 16 folded in.
          homeVersion: PROTOCOL_VERSION,
          homeChanges: [],
          name: null,
          takesWork: null,
          onHomeMac: null,
          heardAt: null,
          removed: false,
        }),
        invoke: (async () => null) as never,
        leave: async () => true,
        close: () => {},
      };
    },
  });
  views.push(view);
  const piece = {
    type: "assistant_delta",
    taskId: "t1",
    text: "The harbour opens at six.",
  } as const;
  hear?.("inf:event", piece);
  const reading = {
    computers: [
      { computerId: null, label: "Mac mini", reading: { status: "unknown", reason: "missing" } },
    ],
  };
  hear?.("inf:computers:resources", reading);
  expect(sent).toEqual([
    ["inf:event", piece],
    ["inf:computers:resources", reading],
  ]);
});

/**
 * A view of another Mac whose saved look - light at 125%, with its panels switch on - answers only
 * when the test says so. Closing the view refuses that answer, as closing the connection refuses
 * every request still waiting.
 */
function viewWithHeldLook() {
  const sent: ShellPreferences[] = [];
  const panels: unknown[] = [];
  let hear: HomeLinkOptions["onPush"] = () => {};
  let answerLook = () => {};
  let refuseLook = (_error: Error) => {};
  const looked = new Promise<void>((resolve, reject) => {
    answerLook = resolve;
    refuseLook = reject;
  });
  // A test that never asks for the look still closes the view; its refusal reaches only askers.
  looked.catch(() => {});
  const saved: ShellPreferences = {
    ...DEFAULT_SHELL_PREFERENCES,
    appearance: { ...DEFAULT_SHELL_PREFERENCES.appearance, theme: "light", size: 125 },
  };
  const view = new ViewBackend({
    joined: new JoinedHome(scratchDir("view-look-")),
    record: {
      version: 1,
      grant: {
        at: "127.0.0.1:1",
        homeKey: "unused",
        deviceId: "view",
        kind: "view",
        key: "unused",
        cert: "unused",
      },
      name: null,
      joinedAt: 1,
    },
    broadcast: (channel, payload) => {
      if (channel === "inf:shell:preferences") sent.push(payload as ShellPreferences);
      if (channel === "inf:plugins:personal") panels.push(payload);
    },
    notifications: { supported: () => false, focused: () => true, show: () => {} },
    onThisMac: () => {},
    onRemoved: () => {},
    updates: unusedUpdates,
    link: (options) => {
      hear = options.onPush;
      return {
        start: () => {},
        state: () => ({
          contact: "in-reach",
          access: "full",
          // A home on this major, which has by its version what major 16 folded in.
          homeVersion: PROTOCOL_VERSION,
          homeChanges: [],
          name: null,
          takesWork: null,
          onHomeMac: null,
          heardAt: null,
          removed: false,
        }),
        invoke: (async (channel: string) => {
          if (channel !== "inf:shell:preferences") throw new Error(`Unasked ${channel}`);
          await looked;
          return saved;
        }) as never,
        leave: async () => true,
        close: () => refuseLook(new Error("The connection went mid-request.")),
      };
    },
  });
  views.push(view);
  return {
    view,
    sent,
    saved,
    answerLook,
    /** The other Mac's panels switch, pushed as it changes there. */
    hearPanels: () => hear("inf:shell:preferences", saved, false),
    panels,
    /** The other Mac's panel snapshot, pushed live or replayed on reconnecting. */
    hearSnapshot: (snapshot: PersonalSnapshot, replayed: boolean) =>
      hear("inf:plugins:personal", snapshot, replayed),
  };
}

// docs/runbooks.md, "Panels": a runbook's panel the first mate left off is listed in this Mac's
// window too, while a panel being built there still shows only on its own computer.
it("passes the other Mac's refused runbook panels to this window and keeps its drafts back", () => {
  const { panels, hearSnapshot } = viewWithHeldLook();
  const refused = [
    { id: "desk-reading", runbook: "desk", by: "Reading desk", why: "another panel has that id" },
  ];
  for (const replayed of [false, true])
    hearSnapshot({ extensions: [], drafts: [], refused }, replayed);
  expect(panels).toEqual([
    { extensions: [], refused },
    { extensions: [], refused },
  ]);
});

// docs/view.md, "The switch and the layout": this Mac takes the other Mac's saved look once, and a
// panels switch pushed before that look answers waits for it, so the window is never drawn in the
// catalog's look first. The ordering the merge queue's batch hit, held here so it runs every time.
it("tells a panels switch heard before the other Mac's look answers only after that look", async () => {
  const { sent, saved, answerLook, hearPanels } = viewWithHeldLook();
  hearPanels();
  expect(sent).toEqual([]);
  answerLook();
  await vi.waitFor(() => expect(sent.at(-1)?.panels.enabled).toBe(true));
  expect(sent.map((value) => value.appearance)).toEqual(sent.map(() => saved.appearance));
});

// The review of that fix: a switch still waiting when this view is closed - leaving the other Mac,
// or removed from it - would tell the windows the catalog's look as the look's answer is refused.
it("tells no waiting panels switch once the view is closed", async () => {
  const { view, sent, hearPanels } = viewWithHeldLook();
  hearPanels();
  view.dispose();
  // The refusal's work all runs before the next turn of the event loop.
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(sent).toEqual([]);
});

// INF-5355's review, the captain's skip-replayed-navigation: the first mate pointing the captain's
// window at a task's record or a place in Settings moves the window as it arrives; the same ask a
// welcome sends again after a drop is old and moves nobody, while the rest it sends again still
// reaches the window. A real home's connection numbers and replays them to the view's real link.
it("passes a pointing event on live, and drops one a welcome sends again after a drop", async () => {
  const at = await home();
  const grant = await at.join("view", "MacBook Air");
  const events: unknown[] = [];
  const sockets: WebSocket[] = [];
  const connected = vi.fn();
  const view = new ViewBackend({
    joined: new JoinedHome(scratchDir("view-pointing-")),
    onConnected: connected,
    record: { version: 1, grant, name: null, joinedAt: 1 },
    broadcast: (channel, payload) => {
      if (channel === "inf:event") events.push(payload);
    },
    notifications: { supported: () => false, focused: () => true, show: () => {} },
    onThisMac: () => {},
    onRemoved: () => {},
    updates: unusedUpdates,
    dial: async (dialing, reached) => {
      const socket = await dialHome(dialing, { reached });
      sockets.push(socket);
      return socket;
    },
  });
  views.push(view);
  const settings = { type: "settings_shown", section: "devices", item: "mini" } as const;
  const record = { type: "task_record_shown", taskId: "task-1" } as const;
  // Any other event the welcome sends again: its fields are not read here.
  const changed = { type: "task_changed", taskId: "task-1" } as never;
  const heard = (count: number) =>
    expect.poll(() => events.length, { timeout: 4_000, interval: 10 }).toBe(count);
  // A TLS socket can exist before the home handles the hello and starts sending pushes.
  await expect.poll(() => connected.mock.calls.length, { timeout: 4_000, interval: 10 }).toBe(1);
  at.events.emit("inf:event", changed);
  await heard(1);
  // The view's own socket goes; the home numbers what it misses, and the welcome sends it again.
  sockets.at(-1)?.terminate();
  at.events.emit("inf:event", settings);
  at.events.emit("inf:event", record);
  at.events.emit("inf:event", changed);
  await heard(2);
  expect(events).toEqual([changed, changed]);
  // Asked again while in reach, each moves the window as it arrives.
  at.events.emit("inf:event", settings);
  at.events.emit("inf:event", record);
  await heard(4);
  expect(events).toEqual([changed, changed, settings, record]);
});

function pressView(
  prefix: string,
  changes: () => HomeLinkState["homeChanges"],
  invoke: ReturnType<typeof vi.fn>,
): ViewBackend {
  const view = new ViewBackend({
    joined: new JoinedHome(scratchDir(prefix)),
    record: {
      version: 1,
      grant: {
        at: "127.0.0.1:1",
        homeKey: "unused",
        deviceId: "view",
        kind: "view",
        key: "unused",
        cert: "unused",
      },
      name: null,
      joinedAt: 1,
    },
    broadcast: () => {},
    notifications: { supported: () => false, focused: () => true, show: () => {} },
    onThisMac: () => {},
    onRemoved: () => {},
    updates: unusedUpdates,
    link: () => ({
      start: () => {},
      state: () => ({
        contact: "in-reach",
        access: "full",
        homeVersion: null,
        homeChanges: changes(),
        name: null,
        takesWork: null,
        onHomeMac: null,
        heardAt: null,
        removed: false,
      }),
      invoke: invoke as never,
      leave: async () => true,
      close: () => {},
    }),
  });
  views.push(view);
  return view;
}

// INF-4175: a choice's record names what pressed its button. An older home
// reads the press's submission strictly and would take one naming its input
// as unreadable, so a view leaves the input out there and sends it to a home
// that lists the change.
it("sends what pressed a card's button only to a home that reads it", async () => {
  let changes: HomeLinkState["homeChanges"] = null;
  const invoke = vi.fn(async () => ({}));
  const view = pressView("view-press-input-", () => changes, invoke);
  const pressed = { id: "862e395c997ddf0c7f20cc8187ca2157", offerId: "offer-1" };
  const input = { kind: "pointer", pointer: "mouse" } as const;
  const act = (submission: object) => ["card-1", "start", "chrome", undefined, submission];
  const noteDone = (submission: object) => ["card-1", submission];
  for (const older of [
    null,
    CONTRACT_CHANGES.names.filter((name) => name !== "card-press-input"),
  ]) {
    changes = older;
    invoke.mockClear();
    await view.dispatch("inf:cards:act", act({ ...pressed, input }) as never);
    await view.dispatch("inf:cards:note-done", noteDone({ ...pressed, input }) as never);
    expect(invoke.mock.calls).toEqual([
      ["inf:cards:act", act(pressed)],
      ["inf:cards:note-done", noteDone(pressed)],
    ]);
  }
  changes = [...CONTRACT_CHANGES.names];
  invoke.mockClear();
  await view.dispatch("inf:cards:act", act({ ...pressed, input }) as never);
  await view.dispatch("inf:cards:note-done", noteDone({ ...pressed, input }) as never);
  expect(invoke.mock.calls).toEqual([
    ["inf:cards:act", act({ ...pressed, input })],
    ["inf:cards:note-done", noteDone({ ...pressed, input })],
  ]);
});

// INF-4439: a note's press carries the words left in the card's field. An
// older home refuses that whole request, so a view refuses it first in plain
// words and the field keeps them; it never strips them, which would drop them.
it("refuses a note's press with words before an older home, and sends it to one that reads them", async () => {
  let changes: HomeLinkState["homeChanges"] = null;
  const invoke = vi.fn(async () => ({}));
  const view = pressView("view-note-words-", () => changes, invoke);
  const pressed = { id: "862e395c997ddf0c7f20cc8187ca2157" };
  const words = { answers: withAnythingElse([], "Keep the chart") };
  for (const older of [null, CONTRACT_CHANGES.names.filter((name) => name !== "note-done-words")]) {
    changes = older;
    invoke.mockClear();
    await expect(
      view.dispatch("inf:cards:note-done", ["card-1", pressed, words] as never),
    ).rejects.toThrow("Send them with Chat first");
    await view.dispatch("inf:cards:note-done", ["card-1", pressed] as never);
    expect(invoke.mock.calls).toEqual([["inf:cards:note-done", ["card-1", pressed]]]);
  }
  changes = [...CONTRACT_CHANGES.names];
  invoke.mockClear();
  await view.dispatch("inf:cards:note-done", ["card-1", pressed, words] as never);
  expect(invoke.mock.calls).toEqual([["inf:cards:note-done", ["card-1", pressed, words]]]);
});

// INF-5192: Add project's listing says when it stopped early. A view lists
// through the request that says so only on a home that answers it, and a
// home that does keeps its own refusals - a 401 is never read again through
// the older request.
it("lists a host's projects through the older request only on a home without the change", async () => {
  let changes: HomeLinkState["homeChanges"] = null;
  const project = {
    fullName: "field-team/field-notes",
    cloneUrl: "https://bitbucket.org/field-team/field-notes.git",
    url: null,
    updatedAt: null,
    private: true,
  };
  const invoke = vi.fn(async (channel: string) =>
    channel === "inf:forges:projects" ? [project] : { projects: [project], complete: false },
  );
  const view = pressView("view-projects-listed-", () => changes, invoke);
  for (const older of [
    null,
    CONTRACT_CHANGES.names.filter((name) => name !== "bitbucket-sign-in"),
  ]) {
    changes = older;
    invoke.mockClear();
    expect(await view.dispatch("inf:forges:projects-listed", ["bitbucket.org"])).toEqual({
      projects: [project],
      complete: true,
    });
    expect(invoke.mock.calls).toEqual([["inf:forges:projects", ["bitbucket.org"]]]);
  }
  changes = [...CONTRACT_CHANGES.names];
  invoke.mockClear();
  expect(await view.dispatch("inf:forges:projects-listed", ["bitbucket.org"])).toEqual({
    projects: [project],
    complete: false,
  });
  invoke.mockClear();
  invoke.mockRejectedValueOnce(new Error("Bitbucket answered 401"));
  await expect(view.dispatch("inf:forges:projects-listed", ["bitbucket.org"])).rejects.toThrow(
    "401",
  );
  expect(invoke.mock.calls).toEqual([["inf:forges:projects-listed", ["bitbucket.org"]]]);
});

// docs/forge.md, "Advisory workflows": Settings' address save and target
// project choice carry the advisory reset they showed, which a home that does
// not read it refuses with the whole save, while it keeps no list to clear.
it("sends a project move's shown advisory reset only to a home that reads it", async () => {
  let changes: HomeLinkState["homeChanges"] = null;
  const invoke = vi.fn(async () => ({}));
  const view = pressView("view-shown-reset-", () => changes, invoke);
  const address = {
    origin: "https://github.com/examples/project-next.git",
    advisoryWorkflowsCleared: [".github/workflows/early-tests.yml"],
  };
  const target = { contributionDestination: "fork", advisoryWorkflowsCleared: [] };
  const send = async () => {
    invoke.mockClear();
    await view.dispatch("inf:repos:configure", ["project-1", address] as never);
    await view.dispatch("inf:repos:configure", ["project-1", target] as never);
    return invoke.mock.calls;
  };
  for (const older of [
    null,
    CONTRACT_CHANGES.names.filter((name) => name !== PROJECT_ADVISORY_WORKFLOWS),
  ]) {
    changes = older;
    expect(await send()).toEqual([
      ["inf:repos:configure", ["project-1", { origin: address.origin }]],
      ["inf:repos:configure", ["project-1", { contributionDestination: "fork" }]],
    ]);
  }
  changes = [...CONTRACT_CHANGES.names];
  expect(await send()).toEqual([
    ["inf:repos:configure", ["project-1", address]],
    ["inf:repos:configure", ["project-1", target]],
  ]);
});

// INF-4207 piece 2: a window says it is catching up while a replay's missed pushes arrive, and live after.
it("tells the window it replays from the welcome until the replay's last push, and a reload raises its count", () => {
  let link: HomeLinkOptions | undefined;
  const said: { replaying: boolean; caughtUp: number }[] = [];
  const state: HomeLinkState = {
    contact: "in-reach",
    access: "full",
    homeVersion: PROTOCOL_VERSION,
    homeChanges: [],
    name: null,
    takesWork: null,
    onHomeMac: null,
    heardAt: null,
    removed: false,
  };
  const view = new ViewBackend({
    joined: new JoinedHome(scratchDir("view-replay-")),
    record: {
      version: 1,
      grant: {
        at: "127.0.0.1:1",
        homeKey: "unused",
        deviceId: "view",
        kind: "view",
        key: "unused",
        cert: "unused",
      },
      name: null,
      joinedAt: 1,
    },
    broadcast: () => {},
    notifications: { supported: () => false, focused: () => true, show: () => {} },
    onThisMac: (thisMac) => {
      if (thisMac.role === "view")
        said.push({ replaying: thisMac.replaying === true, caughtUp: thisMac.caughtUp });
    },
    onRemoved: () => {},
    updates: unusedUpdates,
    link: (options) => {
      link = options;
      return {
        start: () => {},
        state: () => state,
        invoke: (async () => null) as never,
        leave: async () => true,
        close: () => {},
      };
    },
  });
  views.push(view);
  const welcome = (catchUp: "replay" | "reload", missed: number) => {
    link?.onWelcoming?.(catchUp, missed);
    link?.onState?.({ ...state, contact: "in-reach" });
    link?.onCaughtUp?.(catchUp);
  };
  welcome("replay", 2);
  expect(said.at(-1)).toEqual({ replaying: true, caughtUp: 0 });
  link?.onReplayed?.();
  expect(said.at(-1)).toEqual({ replaying: false, caughtUp: 0 });
  const before = said.length;
  welcome("replay", 0);
  expect(said.slice(before).some((entry) => entry.replaying)).toBe(false);
  // A reload is counted in the same word that says the Mac is back.
  const reloading = said.length;
  welcome("reload", 0);
  expect(said.slice(reloading)).toEqual([{ replaying: false, caughtUp: 1 }]);
  // A replay cut short by the connection's end is not said as still arriving.
  welcome("replay", 3);
  link?.onState?.({ ...state, contact: "lost" });
  expect(said.at(-1)).toEqual({ replaying: false, caughtUp: 1 });
});

// INF-5446's review: a card's unsent draft goes by live frames, which no welcome
// replays, so the window reads drafts again at every return of the link - even
// one inside the link's grace, which changes no state.
it("tells the window each return of the link, replayed or not, even one that changes no state", () => {
  let link: HomeLinkOptions | undefined;
  const said: (number | undefined)[] = [];
  const state: HomeLinkState = {
    contact: "in-reach",
    access: "full",
    homeVersion: PROTOCOL_VERSION,
    homeChanges: [],
    name: null,
    takesWork: null,
    onHomeMac: null,
    heardAt: null,
    removed: false,
  };
  const view = new ViewBackend({
    joined: new JoinedHome(scratchDir("view-link-back-")),
    record: {
      version: 1,
      grant: {
        at: "127.0.0.1:1",
        homeKey: "unused",
        deviceId: "view",
        kind: "view",
        key: "unused",
        cert: "unused",
      },
      name: null,
      joinedAt: 1,
    },
    broadcast: () => {},
    notifications: { supported: () => false, focused: () => true, show: () => {} },
    onThisMac: (thisMac) => {
      if (thisMac.role === "view") said.push(thisMac.linkBack);
    },
    onRemoved: () => {},
    updates: unusedUpdates,
    link: (options) => {
      link = options;
      return {
        start: () => {},
        state: () => state,
        invoke: (async () => null) as never,
        leave: async () => true,
        close: () => {},
      };
    },
  });
  views.push(view);
  // As the link welcomes: the state is said only when it changed.
  const welcome = (catchUp: "replay" | "reload", stateChanged: boolean) => {
    link?.onWelcoming?.(catchUp, 0);
    if (stateChanged) link?.onState?.(state);
    link?.onCaughtUp?.(catchUp);
  };
  welcome("reload", true);
  expect(said.at(-1)).toBeUndefined();
  welcome("replay", false);
  expect(said.at(-1)).toBe(1);
  const told = said.length;
  welcome("replay", true);
  expect(said.slice(told)).toEqual([2]);
});

// INF-4835 piece 3 (captain: "Fold them into one row by itself, keeping the one
// that runs work"): a Mac's window asks its home to fold its row once, and only
// of a home that has the fold.
it("asks the fold once, at the first welcome from a home that lists it", () => {
  let link: HomeLinkOptions | undefined;
  const invoke = vi.fn(async (_channel: string, _args: unknown[]) => null);
  const state: HomeLinkState = {
    contact: "in-reach",
    access: "full",
    homeVersion: PROTOCOL_VERSION,
    homeChanges: [],
    name: null,
    takesWork: null,
    onHomeMac: null,
    heardAt: null,
    removed: false,
  };
  const fold = { into: "work-entry", cert: "cert", signature: "c2lnbmVk" };
  const view = new ViewBackend({
    joined: new JoinedHome(scratchDir("view-fold-")),
    record: {
      version: 1,
      grant: {
        at: "127.0.0.1:1",
        homeKey: "unused",
        deviceId: "window-entry",
        kind: "mac",
        key: "unused",
        cert: "unused",
      },
      name: null,
      joinedAt: 1,
    },
    broadcast: () => {},
    notifications: { supported: () => false, focused: () => true, show: () => {} },
    onThisMac: () => {},
    onRemoved: () => {},
    updates: unusedUpdates,
    fold,
    link: (options) => {
      link = options;
      return {
        start: () => {},
        state: () => state,
        invoke: invoke as never,
        leave: async () => true,
        close: () => {},
      };
    },
  });
  views.push(view);
  const folds = () => invoke.mock.calls.filter(([channel]) => channel === "inf:devices:fold");
  link?.onState?.({ ...state, homeChanges: [] });
  expect(folds()).toEqual([]);
  link?.onState?.({ ...state, homeChanges: [...CONTRACT_CHANGES.names] });
  link?.onState?.({ ...state, contact: "lost", homeChanges: [...CONTRACT_CHANGES.names] });
  link?.onState?.({ ...state, homeChanges: [...CONTRACT_CHANGES.names] });
  expect(folds()).toEqual([["inf:devices:fold", [fold]]]);
});

// The captain's words: "when i'm literally working actively on my desktop app, my phone still
// gets push notification". A view on another Mac says when its window is in front and when it
// leaves, again at each welcome since the first mate there forgets it as the connection drops,
// and never to a first mate that does not list the request.
it("tells the first mate there when this Mac's window is in front and when it leaves, again at each welcome", async () => {
  let changes: HomeLinkState["homeChanges"] = null;
  let caughtUp: HomeLinkOptions["onCaughtUp"];
  const invoke = vi.fn(async (_channel: string, _args: unknown[]) => ({ ok: true }));
  const view = new ViewBackend({
    joined: new JoinedHome(scratchDir("view-front-")),
    record: {
      version: 1,
      grant: {
        at: "127.0.0.1:1",
        homeKey: "unused",
        deviceId: "view",
        kind: "view",
        key: "unused",
        cert: "unused",
      },
      name: null,
      joinedAt: 1,
    },
    broadcast: () => {},
    notifications: { supported: () => false, focused: () => true, show: () => {} },
    onThisMac: () => {},
    onRemoved: () => {},
    updates: unusedUpdates,
    link: (options) => {
      caughtUp = options.onCaughtUp;
      return {
        start: () => {},
        state: () => ({
          contact: "in-reach",
          access: "full",
          homeVersion: PROTOCOL_VERSION,
          homeChanges: changes,
          name: null,
          takesWork: null,
          onHomeMac: null,
          heardAt: null,
          removed: false,
        }),
        invoke: invoke as never,
        leave: async () => true,
        close: () => {},
      };
    },
  });
  views.push(view);
  const said = () =>
    invoke.mock.calls.filter(([channel]) => channel === "inf:window:front").map(([, args]) => args);

  // Before the first welcome there is nobody to tell; the welcome says it.
  view.front(true);
  expect(said()).toEqual([]);
  changes = [...CONTRACT_CHANGES.names];
  caughtUp?.("reload");
  expect(said()).toEqual([[true]]);
  view.front(false);
  expect(said()).toEqual([[true], [false]]);
  // Out of the front, a welcome says nothing: a first mate that forgot the window counts it out.
  caughtUp?.("replay");
  expect(said()).toEqual([[true], [false]]);
  view.front(true);
  caughtUp?.("replay");
  expect(said()).toEqual([[true], [false], [true], [true]]);

  changes = [];
  view.front(false);
  caughtUp?.("reload");
  expect(said()).toEqual([[true], [false], [true], [true]]);
});

// INF-5326's piece 4 review: a panel in this Mac's window reads this Mac's own
// look (docs/view.md, "The switch and the layout"), which a change here never
// sends to the other Mac, and only the settings the other Mac holds are asked
// of it. The look's change is told to this Mac's windows, which refreshes the read.
it("answers a panel's settings read from this Mac's own look, asking the other Mac only for what it holds", async () => {
  const homeLook: ShellPreferences = DEFAULT_SHELL_PREFERENCES;
  const asked: [string, unknown[]][] = [];
  const told: ShellPreferences[] = [];
  const view = new ViewBackend({
    joined: new JoinedHome(scratchDir("view-settings-")),
    record: {
      version: 1,
      grant: {
        at: "127.0.0.1:1",
        homeKey: "unused",
        deviceId: "view",
        kind: "view",
        key: "unused",
        cert: "unused",
      },
      name: null,
      joinedAt: 1,
    },
    broadcast: (channel, payload) => {
      if (channel === "inf:shell:preferences") told.push(payload as ShellPreferences);
    },
    notifications: { supported: () => false, focused: () => true, show: () => {} },
    onThisMac: () => {},
    onRemoved: () => {},
    updates: unusedUpdates,
    link: () => ({
      start: () => {},
      state: () => ({
        contact: "in-reach",
        access: "full",
        homeVersion: PROTOCOL_VERSION,
        homeChanges: [],
        name: null,
        takesWork: null,
        onHomeMac: null,
        heardAt: null,
        removed: false,
      }),
      invoke: (async (channel: string, args: unknown[]) => {
        asked.push([channel, args]);
        if (channel === "inf:shell:preferences") return homeLook;
        if (channel === "inf:settings:current") return { notifications: { enabled: true } };
        throw new Error(`Unasked ${channel}`);
      }) as never,
      leave: async () => true,
      close: () => {},
    }),
  });
  views.push(view);
  const own = {
    ...homeLook.appearance,
    theme: "light" as const,
    ambientMusic: true,
    ambientStyle: "quiet-cove" as const,
    ambientVolume: 25,
  };
  await view.dispatch("inf:settings:appearance:set", [own]);
  expect(told.at(-1)?.appearance).toEqual(own);
  asked.length = 0;
  expect(
    await view.dispatch("inf:settings:current", [["theme", "ambient-music", "notifications"]]),
  ).toEqual({
    theme: { theme: "light" },
    "ambient-music": { on: true, paused: false, style: "quiet-cove", volume: 25 },
    notifications: { enabled: true },
  });
  expect(asked).toEqual([["inf:settings:current", [["notifications"]]]]);
  asked.length = 0;
  expect(await view.dispatch("inf:settings:current", [["theme"]])).toEqual({
    theme: { theme: "light" },
  });
  expect(asked).toEqual([]);
});
