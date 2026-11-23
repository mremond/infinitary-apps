import { describe, expect, it } from "vitest";
import { CONVERSE_TEXT_MAX_CHARS, TURN_IMAGES_MAX } from "./cards";
import {
  CHANGE_PRESENTATIONS_SINCE,
  contractAccess,
  hasSince16,
  homeHearsWhileReading,
  MESSAGES_WHILE_READING,
  PLACED_WORK_SINCE,
  sideToUpdate,
  speaksChangePresentations,
  takesWork,
} from "./contractFeatures";
import {
  CORE_INVOKE_CHANNELS,
  CORE_PUSH_CHANNELS,
  HOME_CAPABILITIES,
  HOST_INVOKE_CHANNELS,
  INVOKE_CHANNELS,
  invokeContract,
  isViewInvokeChannel,
  PROTOCOL_VERSION,
  PUSH_CHANNELS,
  parseInvokeRequest,
  pushContract,
  VIEW_FLOOR,
  VIEW_INVOKE_CHANNELS,
  WORK_INVOKE_CHANNELS,
} from "./ipc";

describe("ipc contract", () => {
  // INF-2022: adding exact-update acknowledgements must not change the existing two-argument request.
  it("keeps legacy sighting arguments unchanged while adding a separate exact-update request", () => {
    expect(parseInvokeRequest("inf:cards:seen", ["card-findings", "offer-findings"])).toEqual([
      "card-findings",
      "offer-findings",
    ]);
    expect(() =>
      parseInvokeRequest("inf:cards:seen", ["card-findings", "offer-findings", "update-findings"]),
    ).toThrow();
    expect(
      parseInvokeRequest("inf:cards:seen-update", [
        "card-findings",
        "lifecycle-findings",
        "released-answer",
      ]),
    ).toEqual(["card-findings", "lifecycle-findings", "released-answer"]);
  });

  it("accepts a well-formed healthcheck response", () => {
    const parsed = invokeContract["inf:app:healthcheck"].response.parse({
      ok: true,
      version: "0.0.0",
      platform: "darwin",
      protocolVersion: PROTOCOL_VERSION,
      capabilities: [...HOME_CAPABILITIES],
    });
    expect(parsed.version).toBe("0.0.0");
    expect(parsed.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(parsed.capabilities).toEqual(["connection"]);
  });

  it("reads a capability it does not know yet, so a newer home's list still parses", () => {
    const parsed = invokeContract["inf:app:healthcheck"].response.parse({
      ok: true,
      version: "0.0.0",
      platform: "darwin",
      protocolVersion: PROTOCOL_VERSION,
      capabilities: ["connection", "a-capability-from-later"],
    });
    expect(parsed.capabilities).toContain("a-capability-from-later");
  });

  it("makes the handshake carry a protocol version a client can compare", () => {
    expect(PROTOCOL_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    // A response without it is not a healthcheck: a client that reads the
    // field must never see undefined instead of a version.
    const missing = invokeContract["inf:app:healthcheck"].response.safeParse({
      ok: true,
      version: "0.0.0",
      platform: "darwin",
    });
    expect(missing.success).toBe(false);
  });

  it("bounds a captain turn by the limits the composer reads", () => {
    const at = "x".repeat(CONVERSE_TEXT_MAX_CHARS);
    const image = { mimeType: "image/png" as const, data: "iVBORw0KGgo=" };
    expect(parseInvokeRequest("inf:converse", [at])).toEqual([at]);
    expect(() => parseInvokeRequest("inf:converse", [`${at}x`])).toThrow();
    expect(() => parseInvokeRequest("inf:converse", [{ text: `${at}x` }])).toThrow();
    const full = Array.from({ length: TURN_IMAGES_MAX }, () => image);
    expect(parseInvokeRequest("inf:converse", [{ images: full }])).toEqual([{ images: full }]);
    expect(() => parseInvokeRequest("inf:converse", [{ images: [...full, image] }])).toThrow();
  });

  it("allows four file pastes in turns and replies but refuses a fifth or oversized UTF-8 text", () => {
    const files = Array.from({ length: 4 }, () => ({ text: "x".repeat(78438) }));
    for (const [channel, args] of [
      ["inf:converse", [{ text: "look", files }]],
      ["inf:cards:reply", ["card-1", { text: "look", files }]],
    ] as const) {
      expect(parseInvokeRequest(channel, args)).toEqual(args);
      const prefix = channel === "inf:cards:reply" ? ["card-1"] : [];
      expect(() =>
        parseInvokeRequest(channel, [...prefix, { files: [...files, files[0]] }]),
      ).toThrow();
      expect(() =>
        parseInvokeRequest(channel, [
          ...prefix,
          { files: [{ text: "é".repeat(3 * 1024 * 1024) }] },
        ]),
      ).toThrow();
    }
  });

  it("parses a request once, for whichever transport carries it", () => {
    expect(parseInvokeRequest("inf:cards:act", ["card-1", "land", "chrome"])).toEqual([
      "card-1",
      "land",
      "chrome",
    ]);
    expect(() => parseInvokeRequest("inf:cards:act", ["card-1", "land"])).toThrow(
      "Rejected inf:cards:act: malformed request",
    );
  });

  it("carries a click's submission beside act, close and reply as it comes", () => {
    // The core reads it leniently and only records it, so the wire never
    // refuses a choice over metadata (docs/card-evidence.md).
    const submission = { id: "gesture-0001", offerId: "offer-1" };
    const act = ["card-1", "go", "chrome", undefined, submission];
    expect(parseInvokeRequest("inf:cards:act", act)).toEqual(act);
    expect(parseInvokeRequest("inf:cards:close", ["card-1", { unreadable: true }])).toEqual([
      "card-1",
      { unreadable: true },
    ]);
    expect(parseInvokeRequest("inf:cards:reply", ["card-1", "Why?", submission])).toEqual([
      "card-1",
      "Why?",
      submission,
    ]);
  });

  it("preserves optional card action values, including falsy values", () => {
    for (const value of [{ planes: [{ speed: 0.5, tiltDeg: 42 }] }, null, false, 0, ""]) {
      const args = ["card-1", "use-settings", "frame", value];
      expect(parseInvokeRequest("inf:cards:act", args)).toEqual(args);
    }
  });

  it("carries the plugin host's reads and the mediated fetch seam on the core surface", () => {
    expect(invokeContract["inf:observe:live"].surface).toBe("core");
    expect(invokeContract["inf:plugins:fetch"].surface).toBe("core");
    expect(
      invokeContract["inf:plugins:fetch"].response.parse({
        ok: false,
        error: { code: "capability_not_granted", message: "none" },
      }),
    ).toMatchObject({ ok: false });
    expect(
      invokeContract["inf:plugins:fetch"].request.safeParse([
        {
          pluginId: "jira",
          alias: "jira",
          request: { path: "/x", headers: { Authorization: "b" } },
        },
      ]).success,
    ).toBe(false);
    expect(
      invokeContract["inf:frames:mount"].response.safeParse({ mountId: "m", url: "https://x/" })
        .success,
    ).toBe(false);
  });

  /**
   * Preferences are the CORE's (1.5.0): the theme and the rail layout are
   * the captain's choices about the app, not details of one window, so a
   * fresh window profile cannot forget them and a client other than this
   * renderer can read them.
   */
  it("carries the captain's preferences on the core surface, strictly shaped", () => {
    expect(invokeContract["inf:settings:appearance:get"].surface).toBe("core");
    expect(invokeContract["inf:settings:layout:get"].surface).toBe("core");
    expect(parseInvokeRequest("inf:settings:appearance:set", [{ theme: "light" }])).toEqual([
      { theme: "light" },
    ]);
    expect(() => parseInvokeRequest("inf:settings:appearance:set", [{ theme: "sepia" }])).toThrow(
      "malformed request",
    );
    expect(() =>
      parseInvokeRequest("inf:settings:appearance:set", [{ theme: "dark", scale: 2 }]),
    ).toThrow("malformed request");
    // A layout row written before Step 1 carries only the collapse record;
    // the two newer records default to empty rather than refusing the row.
    expect(
      parseInvokeRequest("inf:settings:layout:set", [{ collapsedPanels: { activity: false } }]),
    ).toEqual([{ collapsedPanels: { activity: false }, hiddenPanels: {}, placements: {} }]);
    expect(
      parseInvokeRequest("inf:settings:layout:set", [
        {
          collapsedPanels: {},
          hiddenPanels: { now: true },
          placements: { activity: { x: "right", y: "top" } },
        },
      ]),
    ).toEqual([
      {
        collapsedPanels: {},
        hiddenPanels: { now: true },
        placements: { activity: { x: "right", y: "top" } },
      },
    ]);
    expect(() =>
      parseInvokeRequest("inf:settings:layout:set", [
        { collapsedPanels: {}, placements: { activity: { x: "middle", y: "top" } } },
      ]),
    ).toThrow("malformed request");
    // The one value the host applies (1.6.0): a core channel and a core push
    // carrying the same shape, so the pushed value equals a fresh read.
    expect(invokeContract["inf:shell:preferences"].surface).toBe("core");
    expect(pushContract["inf:shell:preferences"].surface).toBe("core");
    expect(pushContract["inf:shell:preferences"].payload).toBe(
      invokeContract["inf:shell:preferences"].response,
    );
    expect(CORE_PUSH_CHANNELS).toContain("inf:shell:preferences");
    expect(() =>
      parseInvokeRequest("inf:settings:layout:set", [{ collapsedPanels: { activity: "no" } }]),
    ).toThrow("malformed request");
  });

  it("puts every channel on exactly one side of the core/host line", () => {
    expect(INVOKE_CHANNELS).toEqual(Object.keys(invokeContract));
    expect([...CORE_INVOKE_CHANNELS, ...HOST_INVOKE_CHANNELS].sort()).toEqual(
      [...INVOKE_CHANNELS].sort(),
    );
    const host = new Set<string>(HOST_INVOKE_CHANNELS);
    expect(CORE_INVOKE_CHANNELS.filter((channel) => host.has(channel))).toEqual([]);
  });

  /**
   * The host surface is the shell's own: the browser it opens links in, the
   * folder picker, the whisper model it serves to the renderer, the login
   * item and the dock, what this app is on its Mac - the one holding
   * Firstmate, or a view of another (docs/view.md) - with its one push, and
   * the window's keys, which belong to the Mac whose keyboard pressed them
   * (docs/keyboard.md), and the two buttons of the notice over a window
   * whose command stopped, which start this program again or quit it
   * (docs/run.md, "When the command stops"), and whether the window holds
   * words not yet sent, which an app following its home's version waits on
   * before it starts again (docs/view.md, "Following the home's version").
   * Everything else is the core's, so a channel added without a deliberate
   * classification lands on the protocol - and fails here if that was wrong.
   */
  it("keeps the host surface to the shell's own affordances", () => {
    expect([...HOST_INVOKE_CHANNELS].sort()).toEqual([
      "inf:app:choose-folder",
      "inf:app:open-external",
      "inf:app:open-runbook-folder",
      "inf:app:quit",
      "inf:app:restart-command",
      "inf:app:start-here",
      "inf:app:stop-command",
      "inf:cards:open-saved-file",
      // A card's file saved into the Downloads of the computer whose window
      // the captain clicked Save in (docs/card-authoring.md, "Files for the captain").
      "inf:cards:save-file",
      // Save all: every file of a card into one new folder in that computer's Downloads.
      "inf:cards:save-files",
      "inf:cards:saved-files",
      // The card a click on its notification asked this window to open (docs/view.md, "Notifications").
      "inf:cards:take-notified",
      // Following along once this computer's first mate's computer added it, at the first
      // launch (docs/view.md, "Following along").
      "inf:devices:follow-added",
      "inf:devices:join",
      "inf:devices:join-at",
      "inf:devices:join-held",
      "inf:devices:leave",
      // Sharing settings and what this computer reads of itself for Set up from your first
      // mate's computer (docs/view.md, "Set up from your first mate's computer").
      "inf:devices:open-sharing",
      "inf:devices:set-up-here",
      // Try again on a Mac whose work could not be set up (docs/view.md, "A Mac that runs work").
      "inf:devices:set-up-work",
      // Take over from the copy this Mac keeps (docs/devices.md, "Taking over").
      "inf:devices:take-over",
      "inf:devices:this-mac",
      "inf:files:choose",
      "inf:files:inspect",
      "inf:frames:alive",
      "inf:frames:mount",
      "inf:frames:unmount",
      "inf:keyboard:keymap",
      "inf:keyboard:offer",
      "inf:keyboard:panels",
      "inf:keyboard:record",
      // INF-4555's accepted plan: the key reminder's switch, this computer's own.
      "inf:keyboard:reminders",
      "inf:keyboard:reminders:set",
      "inf:keyboard:run",
      "inf:keyboard:save",
      // The save sheet for Secrets history, metadata only, on the window the
      // captain chose it in (docs/secrets.md).
      "inf:secrets:export",
      "inf:update:unsent",
      "inf:voice:mic-access",
      "inf:voice:open-mic-settings",
      // This Mac's voice helper and the recordings the window hands it
      // (docs/architecture.md section 8).
      "inf:voice:recognizer",
      "inf:voice:transcribe",
      "inf:voice:warm-up",
      // The window's own buttons where the app draws them (design skill
      // readme, "Linux desktop conventions").
      "inf:window:control",
      // The window's fence, pushed back behind every push sent before it.
      "inf:window:fence",
      // Whether someone is at this computer, for the ambient music (src/main/presence.ts).
      "inf:window:presence",
      "inf:window:state",
    ]);
    const corePush = new Set<string>(CORE_PUSH_CHANNELS);
    expect(PUSH_CHANNELS.filter((channel) => !corePush.has(channel))).toEqual([
      // INF-1348: desktop-only grouping leaves the paired core contract unchanged.
      "inf:events",
      // The window told to open the card a click on its notification asked for (docs/view.md, "Notifications").
      "inf:cards:notified",
      "inf:devices:this-mac",
      "inf:keyboard:command",
      // INF-3547's accepted plan, piece 2: a movement key handed to the frame holding focus.
      "inf:keyboard:move",
      "inf:keyboard:taken",
      "inf:keyboard:keymap",
      "inf:keyboard:recorded",
      "inf:keyboard:reminders",
      "inf:keyboard:next",
      "inf:window:state",
      "inf:window:presence",
      "inf:window:fence",
    ]);
  });

  /**
   * What a paired view may ask over the connection (docs/connection.md):
   * what the captain does on the stage of another Mac, the reads that draw
   * it, and the automation rules that run there (docs/automation.md). Every other core channel stays home's, so a channel added
   * without a deliberate classification is refused to views - and widening
   * this list fails here until it is meant.
   */
  it("lets a paired view ask every request but what stays on the first mate's own computer", () => {
    for (const channel of CORE_INVOKE_CHANNELS)
      expect(["views", "home", "work"], channel).toContain(invokeContract[channel].reach);
    for (const channel of HOST_INVOKE_CHANNELS)
      expect("reach" in invokeContract[channel], channel).toBe(false);
    expect([...VIEW_INVOKE_CHANNELS].sort()).toEqual([
      "inf:accounts:add",
      "inf:accounts:custom:address",
      "inf:accounts:custom:cancel",
      "inf:accounts:custom:check",
      "inf:accounts:custom:connect",
      "inf:accounts:custom:discover",
      "inf:accounts:custom:list",
      "inf:accounts:custom:prepare",
      "inf:accounts:custom:profiles",
      "inf:accounts:custom:recheck",
      "inf:accounts:custom:review",
      "inf:accounts:custom:save",
      "inf:accounts:keep-going",
      "inf:accounts:list",
      "inf:accounts:pin",
      "inf:accounts:remove",
      "inf:accounts:rename",
      "inf:accounts:set-enabled",
      "inf:accounts:sign-in",
      "inf:accounts:use-saved-reset",
      "inf:accounts:use-saved-resets",
      "inf:app:first-run",
      "inf:app:first-run:crew-word",
      "inf:app:healthcheck",
      "inf:auth:cancel",
      "inf:auth:prompt-reply",
      "inf:auth:providers",
      "inf:automation:delete",
      "inf:automation:history",
      "inf:automation:kept",
      "inf:automation:kept-check",
      "inf:automation:kept-forget",
      "inf:automation:kept-remove",
      "inf:automation:list",
      "inf:automation:notes",
      "inf:automation:notes-save",
      "inf:automation:pause-all",
      "inf:automation:preview",
      "inf:automation:save",
      "inf:automation:state",
      "inf:batches:list",
      "inf:browser:ask",
      "inf:browser:input",
      "inf:browser:places",
      "inf:browser:private-sites",
      "inf:browser:private-sites:add",
      "inf:browser:private-sites:remove",
      "inf:browser:reopen",
      "inf:browser:return",
      "inf:browser:sign-ins",
      "inf:browser:sign-ins:automatic",
      "inf:browser:sign-ins:remove",
      "inf:browser:sign-ins:remove-all",
      "inf:browser:size",
      "inf:browser:stop",
      "inf:browser:take",
      "inf:browser:unwatch",
      "inf:browser:watch",
      "inf:cards:act",
      "inf:cards:close",
      "inf:cards:data",
      "inf:cards:draft",
      "inf:cards:drafts",
      "inf:cards:file",
      "inf:cards:list",
      "inf:cards:log",
      "inf:cards:media",
      "inf:cards:minimize",
      "inf:cards:note-done",
      "inf:cards:open-page",
      "inf:cards:past",
      "inf:cards:picture",
      "inf:cards:reply",
      "inf:cards:seen",
      "inf:cards:seen-update",
      "inf:cards:show",
      "inf:cards:show-past",
      "inf:cards:thread",
      "inf:cards:typeface",
      "inf:computers:presence",
      "inf:computers:resources",
      "inf:conversation:last-turn",
      "inf:conversation:state",
      "inf:converse",
      "inf:crew:counts",
      "inf:decisions:key:remove",
      "inf:decisions:key:set",
      "inf:decisions:use:set",
      "inf:devices:add",
      "inf:devices:address:set",
      "inf:devices:addresses",
      "inf:devices:app-follow",
      "inf:devices:carry-on",
      "inf:devices:change-address",
      "inf:devices:custom:address",
      "inf:devices:custom:cancel",
      "inf:devices:custom:check",
      "inf:devices:custom:connect",
      "inf:devices:custom:discover",
      "inf:devices:custom:profiles",
      "inf:devices:custom:recheck",
      "inf:devices:custom:review",
      "inf:devices:custom:save",
      // Fix it on a Mac's row, and what a Mac's window found of its work (docs/devices.md, "A Mac that has not finished setting up").
      "inf:devices:fix-work",
      "inf:devices:fold",
      "inf:devices:forge-sign-in",
      "inf:devices:forge-sign-in-browser",
      "inf:devices:forge-sign-in-cli",
      "inf:devices:forge-sign-in-key",
      "inf:devices:forge-sign-out",
      "inf:devices:invite",
      "inf:devices:keep",
      "inf:devices:list",
      "inf:devices:nearby",
      "inf:devices:push",
      "inf:devices:remove",
      "inf:devices:runs-on",
      "inf:devices:shown",
      "inf:devices:sign-in",
      "inf:devices:sign-in:answer",
      "inf:devices:sign-in:cancel",
      "inf:devices:sign-ins",
      "inf:devices:sign-out",
      "inf:devices:stop",
      "inf:devices:try-again",
      "inf:devices:update",
      "inf:devices:update-app",
      "inf:devices:update-later",
      "inf:devices:work-setup",
      "inf:feed:recent",
      "inf:forges:cancel",
      "inf:forges:changes",
      "inf:forges:list",
      "inf:forges:projects",
      "inf:forges:projects-listed",
      "inf:forges:sign-in",
      "inf:forges:sign-in-browser",
      "inf:forges:sign-in-cli",
      "inf:forges:sign-in-key",
      "inf:forges:sign-out",
      "inf:home-move:cancel",
      "inf:home-move:ready",
      "inf:home-move:start",
      "inf:home-move:start-here",
      "inf:home-update:install",
      "inf:home-update:later",
      "inf:home-update:status",
      "inf:integrations:add",
      "inf:integrations:check",
      "inf:integrations:configure",
      "inf:integrations:inbox-link",
      "inf:integrations:list",
      "inf:integrations:remove",
      "inf:integrations:rule",
      "inf:integrations:secret",
      "inf:integrations:sign-in",
      "inf:integrations:sign-in-cancel",
      "inf:integrations:sign-in-return",
      "inf:knowledge:collections",
      "inf:knowledge:concepts",
      "inf:knowledge:direction",
      "inf:knowledge:direction:set",
      "inf:knowledge:directions",
      "inf:knowledge:enabled",
      "inf:knowledge:entry",
      "inf:knowledge:findings",
      "inf:knowledge:graph",
      "inf:knowledge:refs",
      "inf:knowledge:uses",
      "inf:models:available",
      "inf:models:reasoning:set",
      "inf:models:slots",
      "inf:models:slots:reset",
      "inf:models:slots:set",
      "inf:models:speed:set",
      // INF-3660's plan, "Your panels, in every window": a panel asks the first mate from any window.
      "inf:plugins:ask-again",
      "inf:plugins:db",
      "inf:plugins:fetch",
      "inf:plugins:files",
      "inf:plugins:integrations",
      "inf:plugins:invoke",
      "inf:plugins:library",
      "inf:plugins:personal:list",
      "inf:plugins:personal:mounts",
      "inf:plugins:retry",
      "inf:plugins:update",
      "inf:projects:list",
      "inf:quota:models",
      "inf:quota:opened",
      "inf:quota:refresh",
      "inf:quota:snapshot",
      "inf:repos:batch-answer",
      "inf:repos:configure",
      "inf:repos:folder",
      "inf:repos:folder:set",
      "inf:repos:list",
      "inf:repos:move",
      "inf:repos:removal",
      "inf:repos:remove",
      "inf:repos:setup",
      "inf:retention:delete-outside",
      "inf:retention:purge",
      "inf:retention:scope",
      "inf:secrets:approvals",
      "inf:secrets:bring",
      "inf:secrets:decide",
      "inf:secrets:enroll",
      "inf:secrets:keep",
      "inf:settings:appearance:get",
      "inf:settings:cost-limit:get",
      "inf:settings:cost-limit:set",
      "inf:settings:current",
      "inf:settings:decisions",
      "inf:settings:decisions:set",
      "inf:settings:firstmate-account:get",
      "inf:settings:firstmate-account:set",
      "inf:settings:firstmate-model:get",
      "inf:settings:firstmate-model:set",
      "inf:settings:layout:get",
      "inf:settings:local-orchestrator:get",
      "inf:settings:local-orchestrator:set",
      "inf:settings:notifications:get",
      "inf:settings:notifications:set",
      "inf:settings:personal-resources:get",
      "inf:settings:personal-resources:set",
      "inf:settings:routing:get",
      "inf:settings:routing:set",
      "inf:settings:runbooks:copy",
      "inf:settings:runbooks:get",
      "inf:settings:runbooks:set",
      "inf:settings:sharing:ask",
      "inf:settings:sharing:get",
      "inf:settings:sharing:phone",
      "inf:settings:sharing:preview",
      "inf:settings:sharing:set",
      "inf:settings:sharing:viewed",
      "inf:shell:preferences",
      "inf:sql:query",
      "inf:standby:keep-home",
      "inf:standby:keep-secrets",
      "inf:standby:list",
      "inf:standby:name",
      "inf:standby:other-home",
      "inf:standby:ready",
      "inf:task:abort",
      "inf:task:close-done",
      "inf:task:delete",
      "inf:task:interrupt",
      "inf:task:move",
      "inf:task:move-options",
      // INF-3127: a paired phone pins a task to the top of Tasks as the Mac does.
      "inf:task:pin",
      "inf:task:run",
      "inf:task:steer",
      "inf:tasks:board",
      "inf:tasks:crewmate",
      "inf:tasks:crewmate:live",
      "inf:tasks:crewmate:picture",
      "inf:tasks:crewmate:result",
      "inf:tasks:detail",
      "inf:tasks:keys",
      "inf:tasks:opened",
      "inf:tasks:search",
      "inf:usage:summary",
      "inf:usage:tasks",
      "inf:view:answer",
      "inf:window:front",
    ]);
  });

  /**
   * What a computer that runs work asks about a conversation it holds
   * (src/shared/work.ts): one request per tool callback - the change and
   * artifact tools among them, which the home does with its own sign-in,
   * the knowledge pair, which reads and writes the home's knowledge, and
   * the integrations pair, which the integrations command asks, the files
   * pair, which the files command asks (docs/files.md), and the
   * shared-card pair that reads one card and corrects a required action's
   * words (INF-2214, docs/card-threads.md "Shared cards"), the start of a
   * program its crewmate needs (INF-3022, docs/programs.md) - a card picture, a
   * job's end, the numbered events, what a task's browser there tells the
   * home and the private sites list it reads, and nothing a view or the window asks.
   */
  it("lets a computer that runs work ask only the work requests", () => {
    expect([...WORK_INVOKE_CHANNELS].sort()).toEqual([
      "inf:work:browser",
      "inf:work:browser-event",
      "inf:work:browser-frame",
      "inf:work:browser-sign-in",
      "inf:work:card",
      "inf:work:card-refused",
      "inf:work:check-change",
      "inf:work:close-card",
      "inf:work:copy-file",
      "inf:work:download-artifact",
      "inf:work:events",
      "inf:work:files",
      "inf:work:followup",
      "inf:work:github-read",
      "inf:work:github-write",
      "inf:work:handover-file",
      "inf:work:integrations",
      "inf:work:job-exit",
      "inf:work:knowledge",
      "inf:work:media",
      "inf:work:open-change",
      "inf:work:picture",
      "inf:work:prepare-change",
      "inf:work:private-sites",
      "inf:work:progress",
      "inf:work:read-card",
      "inf:work:read-workflow",
      "inf:work:record-knowledge",
      "inf:work:reply",
      "inf:work:report",
      "inf:work:revise-required-action",
      "inf:work:secret-ask",
      "inf:work:secret-take",
      "inf:work:secret-use",
      "inf:work:secrets",
      "inf:work:show-merge-card",
      "inf:work:sign-in",
      "inf:work:sign-ins",
      "inf:work:speed",
      "inf:work:speed-note",
      "inf:work:start-program",
      "inf:work:tasks",
      "inf:work:typeface",
      "inf:work:use-integration",
    ]);
    for (const channel of WORK_INVOKE_CHANNELS)
      expect(VIEW_INVOKE_CHANNELS as readonly string[]).not.toContain(channel);
  });

  // INF-1352's plan, the captain's answer one_rule=every-view: a view asks everything but
  // what stays with the first mate's own computer: its Secrets and own hardware. Piece 2
  // brings its devices and Knowledge to every view; piece 3 moves a task's browser to every
  // view: watched, sized and driven from any window.
  it("keeps on the first mate's computer only what is that computer's own", () => {
    const stays = CORE_INVOKE_CHANNELS.filter(
      (channel) => invokeContract[channel].reach === "home",
    );
    const views = new Set<string>(VIEW_INVOKE_CHANNELS);
    expect(stays.length).toBeGreaterThan(0);
    for (const channel of stays) expect(views.has(channel), channel).toBe(false);
    for (const prefix of ["inf:voice:status", "inf:secrets:view"])
      expect(stays.filter((channel) => channel === prefix)).toEqual([prefix]);
    for (const channel of [
      "inf:browser:watch",
      "inf:browser:size",
      "inf:browser:input",
      "inf:browser:take",
      "inf:browser:ask",
      "inf:browser:return",
      // Point at's outline read: a view on another computer marks the picture it already has.
      "inf:browser:places",
    ])
      expect(views.has(channel), channel).toBe(true);
    // Each signed-in Settings read a view of any first mate opens.
    for (const channel of [
      "inf:accounts:list",
      "inf:settings:routing:get",
      "inf:repos:list",
      "inf:devices:list",
      "inf:knowledge:enabled",
    ])
      expect(views.has(channel), channel).toBe(true);
  });

  // INF-1109's accepted Secrets boundary (docs/secrets.md, "Remote decisions"): a view asks only
  // the Secrets requests every paired view asks, whatever started its first mate.
  it("keeps Secrets on the first mate's computer", () => {
    const secrets = CORE_INVOKE_CHANNELS.filter((channel) => channel.startsWith("inf:secrets:"));
    const home = secrets.filter((channel) => invokeContract[channel].reach === "home");
    expect(home.length).toBeGreaterThan(0);
    for (const channel of home) expect(isViewInvokeChannel(channel), channel).toBe(false);
    expect(secrets.filter((one) => invokeContract[one].reach === "views").sort()).toEqual([
      "inf:secrets:approvals",
      "inf:secrets:bring",
      "inf:secrets:decide",
      "inf:secrets:enroll",
      "inf:secrets:keep",
    ]);
  });
});

describe("the version rule (docs/contract.md)", () => {
  it("answers everything to the home's own major, and only reads to any other", () => {
    expect(contractAccess("3.4.1", "3.0.0")).toBe("full");
    expect(contractAccess("3.0.0", "3.9.2")).toBe("full");
    expect(contractAccess("2.17.0", "3.0.0")).toBe("read");
    expect(contractAccess("1.99.0", "3.0.0")).toBe("read");
    expect(contractAccess("0.1.0", "3.0.0")).toBe("read");
    expect(contractAccess("4.0.0", "3.9.2")).toBe("read");
  });

  it("reads a version it cannot parse as reads only", () => {
    for (const version of ["", "3", "3.0", "v3.0.0", "3.0.0-alpha.1", "x.0.0"])
      expect(contractAccess(version, "3.0.0")).toBe("read");
  });

  it("lets a computer that runs work take new work only on the home's own major", () => {
    expect(takesWork("3.4.1", "3.0.0")).toBe(true);
    expect(takesWork("3.0.0", "3.9.2")).toBe(true);
    // INF-416 L: a computer that runs work must update across a major (INF-1649 keeps it strict).
    expect(contractAccess("2.17.0", "3.0.0")).toBe("read");
    expect(takesWork("2.17.0", "3.0.0")).toBe(false);
    expect(takesWork("4.0.0", "3.9.2")).toBe(false);
    for (const version of ["", "3", "v3.0.0", "3.0.0-alpha.1"])
      expect(takesWork(version, "3.0.0")).toBe(false);
    expect(takesWork(PROTOCOL_VERSION)).toBe(true);
  });

  it("gives work only to a computer that speaks the contract placed work began at, or later", () => {
    const [major, minor] = PLACED_WORK_SINCE.split(".").map(Number);
    expect(takesWork(PLACED_WORK_SINCE, PLACED_WORK_SINCE)).toBe(true);
    expect(takesWork(`${major}.${(minor ?? 0) + 3}.0`, PLACED_WORK_SINCE)).toBe(true);
    if (minor) expect(takesWork(`${major}.${minor - 1}.9`, `${major}.${minor + 1}.0`)).toBe(false);
  });

  // INF-1649, the captain's direction A: a floor for every view while work computers stay strict,
  // in both directions ("Yes, both directions").
  it("lets a view change things from the home's floor up to the home's major, and work only on its own", () => {
    const home = { homeFloor: 11 };
    expect(contractAccess("11.0.0", "12.0.0", home)).toBe("full");
    expect(contractAccess("12.3.0", "12.0.0", home)).toBe("full");
    expect(contractAccess("10.1.0", "12.0.0", home)).toBe("read");
    // The same versions as work: the strict same-major rule.
    expect(contractAccess("11.0.0", "12.0.0")).toBe("read");
    // A newer view against an older home: only when the floor its hello said reaches that home.
    expect(contractAccess("13.0.0", "12.0.0", { ...home, clientFloor: 12 })).toBe("full");
    expect(contractAccess("13.0.0", "12.0.0", { ...home, clientFloor: 11 })).toBe("full");
    expect(contractAccess("13.0.0", "12.0.0", { ...home, clientFloor: 13 })).toBe("read");
    expect(contractAccess("13.0.0", "12.0.0", home)).toBe("read");
    for (const version of ["", "12", "v12.0.0", "12.0.0-alpha.1"])
      expect(contractAccess(version, "12.0.0", { ...home, clientFloor: 0 })).toBe("read");
  });

  it("names the side a view outside the window updates", () => {
    expect(sideToUpdate("read", "11.0.0", "13.0.0")).toBe("this");
    expect(sideToUpdate("read", "13.0.0", "11.0.0")).toBe("home");
    expect(sideToUpdate("full", "11.0.0", "12.0.0")).toBeNull();
    expect(sideToUpdate("read", "x", "12.0.0")).toBeNull();
  });

  // INF-4012 piece 2: a view reading only keeps its message box on when the home hears its words.
  it("lets a view reading only message a home that lists the change, or one on a newer major", () => {
    expect(homeHearsWhileReading("13.0.0", [MESSAGES_WHILE_READING], "15.0.0")).toBe(true);
    // The next major folds every name this view's major lists, so it is not named any more.
    expect(homeHearsWhileReading("16.0.0", [], "15.2.0")).toBe(true);
    // Major 16 folded the name in, so a view on a later major reads that home by its number.
    expect(homeHearsWhileReading("16.0.0", [], "17.0.0")).toBe(true);
    expect(homeHearsWhileReading("13.4.0", [], "15.0.0")).toBe(false);
    expect(homeHearsWhileReading("15.1.0", null, "15.0.0")).toBe(false);
    // Before the home's welcome there is no version or list to trust.
    expect(homeHearsWhileReading(undefined, undefined, "15.0.0")).toBe(false);
  });

  // Major 16 folded its named additions in and kept views, so a side on major 15 is still read by the names it lists.
  it("reads an addition folded into major 16 by the other side's version, or by its list on major 15", () => {
    expect(hasSince16("16.0.0", [], "card-files")).toBe(true);
    expect(hasSince16("17.2.0", null, "card-files")).toBe(true);
    expect(hasSince16("15.0.0", ["card-files"], "card-files")).toBe(true);
    expect(hasSince16("15.9.0", ["font-choice"], "card-files")).toBe(false);
    expect(hasSince16("15.9.0", [], "card-files")).toBe(false);
    // Before the other side's hello or welcome there is no version or list to trust.
    expect(hasSince16(undefined, undefined, "card-files")).toBe(false);
    expect(hasSince16(null, null, "card-files")).toBe(false);
  });

  it("measures a view against this contract's own floor when the home names none", () => {
    expect(contractAccess(`${VIEW_FLOOR}.0.0`, PROTOCOL_VERSION, {})).toBe("full");
    expect(contractAccess(`${VIEW_FLOOR - 1}.0.0`, PROTOCOL_VERSION, {})).toBe("read");
  });

  it("measures against this contract when no home version is given", () => {
    expect(contractAccess(PROTOCOL_VERSION)).toBe("full");
    const [major] = PROTOCOL_VERSION.split(".");
    expect(contractAccess(`${Number(major) - 1}.0.0`)).toBe("read");
    expect(contractAccess(`${Number(major) + 1}.0.0`)).toBe("read");
  });
});

// INF-169 F8: already published computers do not advertise a channel they never had.
it("gates shared stories above every previously published 8.x version", () => {
  for (const version of ["8.7.0", "8.8.0", "8.9.0", "8.10.0", "8.11.0", "8.12.0"])
    expect(speaksChangePresentations(version)).toBe(false);
  expect(speaksChangePresentations(CHANGE_PRESENTATIONS_SINCE)).toBe(true);
  expect(speaksChangePresentations(PROTOCOL_VERSION)).toBe(true);
});
