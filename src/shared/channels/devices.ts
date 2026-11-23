import { z } from "zod";
import { appFollowReportSchema } from "../appFollow";
import {
  customApiAddressSchema,
  customApiConnectInputSchema,
  customApiConnectResultSchema,
  customApiReviewSchema,
  customApiViewSchema,
  customCapabilityProfileSchema,
  customListedModelSchema,
  customNetworkModeSchema,
} from "../customApi";
import {
  computerPresenceSchema,
  deviceAddressesSchema,
  deviceCarryOnSchema,
  deviceFoldSchema,
  deviceInviteRequestSchema,
  deviceInviteSchema,
  deviceRemoveWhenSchema,
  deviceViewSchema,
  joinOutcomeSchema,
  PAIRING_LINK_ALSO_MAX,
  thisMacSchema,
} from "../devices";
import {
  forgeBrowserSignInSchema,
  forgeCliSignInResultSchema,
  forgeKeySignInResultSchema,
  forgeKeySignInSchema,
} from "../forges";
import { homeMoveReadySchema } from "../homeMove";
import {
  joinAtAnswerSchema,
  joinAtOptionsSchema,
  linkAtAnswerSchema,
  setUpHereSchema,
  setUpReadsSchema,
} from "../joinByAddress";
import { nearbyMacsViewSchema } from "../nearbyMacs";
import { phonePushAnswerSchema, phonePushRegistrationSchema } from "../phonePush";
import {
  packageUpdateAddressQuestionSchema,
  remoteLoginAddAnswerSchema,
  remoteLoginAddOptionsSchema,
  remoteLoginAddressSchema,
  remoteLoginConfirmQuestionSchema,
  remoteLoginPasswordQuestionSchema,
  remoteLoginRefusedAnswerSchema,
  remoteLoginUpdateOptionsSchema,
} from "../remoteLogin";
import { repoViewSchema } from "../repos";
import { computerResourcesSchema } from "../resources";
import {
  deviceSignInsSchema,
  forgeHostSchema,
  SIGN_IN_ANSWER_MAX_CHARS,
  signInIdSchema,
} from "../signIns";
import {
  otherHomeSchema,
  standbyAddressesSchema,
  standbyReadySchema,
  standbyViewsSchema,
} from "../standby";
import { windowAnswerSchema, windowAskSchema } from "../windowAsks";
import { workSetupReportSchema } from "../workSetup";
import { type ChannelDeclaration, okSchema } from "./common";

/** Your computers and phones: who is in reach, pairing, their sign-ins and joining another Mac. */
export const deviceChannels = {
  // Shared live observations carry no sign-in or device-management authority.
  "inf:computers:presence": {
    effect: "read",
    surface: "core",
    reach: "views",
    request: z.tuple([]),
    response: z.array(computerPresenceSchema),
  },
  "inf:computers:resources": {
    effect: "read",
    surface: "core",
    reach: "views",
    request: z.tuple([]),
    response: computerResourcesSchema,
  },
  // Devices and pairing (docs/devices.md). A paired view asks them too, as
  // the captain at another computer (`DEVICES_FROM_A_VIEW`): the invite's
  // answer carries the link to the window that asked.
  "inf:devices:list": {
    effect: "read",
    surface: "core",
    reach: "views",
    request: z.tuple([]),
    response: z.array(deviceViewSchema),
  },
  "inf:devices:invite": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([deviceInviteRequestSchema]),
    response: deviceInviteSchema,
  },
  // Adding a Mac by its address over Remote Login (docs/devices.md, "Adding
  // a computer by its address"): the captain's own click in Settings -> Devices,
  // never the Firstmate's, which only offers the card whose button does it.
  // It answers once the Mac joined, or rejects with the refusal's words; each
  // step is a `device_setup` feed line. A Mac this Mac has not checked answers
  // the check line first, and nothing is sent until the captain says this is
  // the Mac (`confirm`). A Mac whose user runs another Firstmate's work answers
  // the question asked once, with nothing sent there; `leave` is the captain's
  // yes to it ("Another first mate's Mac"). A Mac that did not let the captain's
  // key in answers the password question, and `password`, typed once, lets
  // Firstmate's own key in there; it is never kept ("The password, once").
  "inf:devices:add": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([remoteLoginAddressSchema, remoteLoginAddOptionsSchema.optional()]),
    response: remoteLoginAddAnswerSchema,
  },
  // Macs nearby (docs/devices.md, "Macs nearby"): while "By its address"
  // is open, this Mac listens for Remote Login's Bonjour announcement and
  // lists each Mac that answers, never trying an address. `true` looks, or
  // keeps looking for another minute; `false` stops. The whole list comes
  // again on `inf:devices:nearby` whenever it reads differently.
  "inf:devices:nearby": {
    effect: "read",
    surface: "core",
    reach: "views",
    request: z.tuple([z.boolean()]),
    response: nearbyMacsViewSchema,
  },
  // Devices' Match: brings a computer that runs work to this Mac's build
  // (docs/devices.md, "Updating" and "Matching the home's build"): this Mac's
  // commit built there over the connection when this Mac runs from source;
  // otherwise its version, over Remote Login for one added by its address or
  // a joined Ubuntu package worker with an update address, else over the
  // connection. Each step is a feed line.
  "inf:devices:update": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64), remoteLoginUpdateOptionsSchema.optional()]),
    response: z.union([
      deviceViewSchema,
      packageUpdateAddressQuestionSchema,
      remoteLoginConfirmQuestionSchema,
      remoteLoginPasswordQuestionSchema,
      remoteLoginRefusedAnswerSchema,
    ]),
  },
  // Moving the first mate to a computer that runs work (docs/devices.md,
  // "Moving the first mate"): the Ready list, the captain's click, which
  // answers at once while progress pushes say the rest, Cancel, and starting
  // the first mate here again when the computer it moves to never answers.
  "inf:home-move:ready": {
    effect: "read",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64)]),
    response: homeMoveReadySchema,
  },
  "inf:home-move:start": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64)]),
    response: z.strictObject({ ok: z.boolean(), text: z.string().min(1).max(600) }),
  },
  "inf:home-move:cancel": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([]),
    response: z.strictObject({ ok: z.boolean(), text: z.string().min(1).max(600) }),
  },
  // The captain's confirmed Start my first mate here again, once the computer
  // it moves to stayed out of reach (docs/devices.md, "A destination that never answers").
  "inf:home-move:start-here": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([]),
    response: z.strictObject({ ok: z.boolean(), text: z.string().min(1).max(600) }),
  },
  // Keeping a copy of the record on computers that run work (docs/devices.md,
  // "Keeping a copy on another computer"): where each copy stands, the
  // captain's Keep a copy here and Stop keeping a copy, and each one's Ready
  // to take over list.
  "inf:standby:list": {
    effect: "read",
    surface: "core",
    reach: "views",
    request: z.tuple([]),
    response: standbyViewsSchema,
  },
  "inf:standby:saved-addresses": {
    effect: "read",
    surface: "core",
    reach: "home",
    request: z.tuple([z.string().min(1).max(64)]),
    response: z
      .array(
        z.object({
          address: standbyAddressesSchema.element,
          network: z.enum(["local", "private"]).nullable(),
        }),
      )
      .max(PAIRING_LINK_ALSO_MAX + 1),
  },
  "inf:standby:name": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64), z.boolean()]),
    response: z.strictObject({ ok: z.boolean(), text: z.string().min(1).max(600) }),
  },
  // Keep the first mate's secrets with a computer's copy: that computer asks
  // the person there to confirm (docs/devices.md, "Secrets on a computer
  // that keeps a copy").
  "inf:standby:keep-secrets": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64)]),
    response: z.strictObject({ ok: z.boolean(), text: z.string().min(1).max(600) }),
  },
  "inf:standby:ready": {
    effect: "read",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64)]),
    response: standbyReadySchema,
  },
  // Two homes answer with one number (docs/devices.md, "Two homes with one
  // number"): the captain keeps this one ("here") or the other, by its id.
  "inf:standby:keep-home": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64)]),
    response: z.strictObject({ ok: z.boolean(), text: z.string().min(1).max(600) }),
  },
  // A window that hears two homes with one number tells each of the other
  // (docs/devices.md, "Two homes with one number"): both hold their acts and ask.
  "inf:standby:other-home": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([otherHomeSchema]),
    response: z.strictObject({ ok: z.boolean() }),
  },
  // A computer that runs work out of reach is removed when it is back, or
  // now, as the captain chose; with neither it is refused, so he is asked
  // (docs/devices.md, "Remove"). Keep it takes a wait for its return back.
  "inf:devices:remove": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64), deviceRemoveWhenSchema.optional()]),
    response: deviceViewSchema,
  },
  // A paired phone hands its computer where to push its cards, or null to
  // stop (docs/phone-push.md, `phone-push.md`). Answered only for the phone
  // that asks; kept beside its device entry and forgotten with it.
  "inf:devices:push": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([phonePushRegistrationSchema.nullable()]),
    response: phonePushAnswerSchema,
  },
  // One computer, one row (docs/devices.md, "One computer, one entry"): a
  // Mac's window folds the entry it holds into the one its work keeps, and
  // the home answers the entry it kept. Only a paired view asks it, as itself.
  "inf:devices:fold": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([deviceFoldSchema]),
    response: deviceViewSchema,
  },
  // Carry its tasks on (docs/devices.md, "Joined again"): each started task
  // on a computer out of reach moves to another computer without what only
  // the first holds, Runs on follows, and once every one has moved the first
  // is removed now. A task that cannot move stays, and so does the entry.
  "inf:devices:carry-on": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64), z.string().min(1).max(64)]),
    response: deviceCarryOnSchema,
  },
  "inf:devices:keep": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64)]),
    response: deviceViewSchema,
  },
  // Update later (docs/devices.md, "Saving work before an update"): lets a
  // computer's update go while its crew's work is being saved, so nothing
  // there is replaced; false when none is being saved.
  "inf:devices:update-later": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64)]),
    response: z.boolean(),
  },
  // Try again (docs/devices.md, "Through the home's SSH"): this Mac tries
  // its own SSH connection to a computer once now, or to every one it
  // stopped trying when none is named; answers how many it tried.
  "inf:devices:try-again": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64).optional()]),
    response: z.strictObject({ tried: z.number().int().nonnegative() }),
  },
  // A Mac's work half (docs/devices.md, "A Mac that has not finished
  // setting up"; `work-setup`): its window tells the home what it found of
  // its own background work at each welcomed connection, asked only as a
  // view, which names the device; and the row's Fix it asks that window,
  // over its own connection, to set its work up again. Fix it answers
  // whether a window of that Mac was connected to ask.
  // A window's answer to what the first mate asked of it (`inf:view:ask`,
  // docs/view.md, "What the first mate asks of a window"), by the ask's id.
  "inf:view:answer": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([windowAskSchema.shape.id, windowAnswerSchema]),
    response: okSchema,
  },
  "inf:devices:work-setup": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([workSetupReportSchema]),
    response: okSchema,
  },
  "inf:devices:fix-work": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64)]),
    response: z.strictObject({ asked: z.boolean() }),
  },
  // The app open on another computer follows the home's version (docs/view.md,
  // "Following the home's version"; `app-follows-home`): it tells the home
  // each step of catching up, asked only as a view, which names the device;
  // and the row's Update asks that app, over its own connection, to catch up
  // now and start again once no words are left unsent there. Update answers whether an app of that computer was
  // connected to ask.
  "inf:devices:app-follow": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([appFollowReportSchema]),
    response: okSchema,
  },
  "inf:devices:update-app": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64)]),
    response: z.strictObject({ asked: z.boolean() }),
  },
  // Change address (docs/devices.md, "Changing its address"): the captain's
  // own click reaches a computer this Mac reaches over its own SSH at
  // another address, once a look there finds that same computer.
  "inf:devices:change-address": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64), remoteLoginAddressSchema]),
    response: z.union([deviceViewSchema, remoteLoginRefusedAnswerSchema]),
  },
  // Every build offers Devices, including a phone, on the home computer and its views.
  "inf:devices:shown": {
    effect: "read",
    surface: "core",
    reach: "views",
    request: z.tuple([]),
    response: z.object({ shown: z.boolean() }),
  },
  // Stop it: closes an open link by its handle before it expires.
  "inf:devices:stop": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64)]),
    response: okSchema,
  },
  // Where devices find this Mac: its own private addresses and the one a
  // link sends a device to. Choosing one is the captain's, in Settings.
  "inf:devices:addresses": {
    effect: "read",
    surface: "core",
    reach: "views",
    request: z.tuple([]),
    response: deviceAddressesSchema,
  },
  "inf:devices:address:set": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64).nullable()]),
    response: deviceAddressesSchema,
  },
  // Where a project's next task starts (docs/helper.md, "Runs on"): a paired
  // computer that runs work by its id, or null for this Mac. Home only, and
  // refused where this build offers no devices (docs/devices.md); a task
  // already started finishes where it started.
  "inf:devices:runs-on": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1), z.string().min(1).max(64).nullable()]),
    response: repoViewSchema,
  },
  // A computer that runs work signs in to its own subscriptions (docs/helper.md,
  // "Its own sign-ins"): Settings -> Intelligence starts the sign-in there and
  // draws it here. Home only, like every sign-in. The answer to a prompt is
  // what the captain typed; it goes to that computer once and is kept
  // nowhere here.
  "inf:devices:sign-ins": {
    effect: "read",
    surface: "core",
    reach: "views",
    request: z.tuple([]),
    response: z.array(deviceSignInsSchema),
  },
  "inf:devices:sign-in": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([
      z.string().min(1).max(64),
      z.string().min(1).max(256),
      z.enum(["oauth", "api_key"]),
      z.string().min(1).max(256).optional(),
    ]),
    response: z.object({ signInId: signInIdSchema }),
  },
  "inf:devices:sign-in:answer": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([
      signInIdSchema,
      z.string().min(1).max(128),
      z.string().max(SIGN_IN_ANSWER_MAX_CHARS).nullable(),
    ]),
    response: okSchema,
  },
  "inf:devices:sign-in:cancel": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([signInIdSchema]),
    response: okSchema,
  },
  "inf:devices:sign-out": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64), z.string().min(1).max(256)]),
    response: okSchema,
  },
  // Its own sign-in where projects live, for its clones and pushes
  // (docs/forge.md, "A computer's own sign-in"): Settings -> Projects starts
  // GitHub's device flow there, its code to read rides `inf:devices:sign-in`,
  // and `inf:devices:sign-in:cancel` stops it. Nothing is typed.
  "inf:devices:forge-sign-in": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64), forgeHostSchema]),
    response: z.object({ signInId: signInIdSchema }),
  },
  // The same sign-in through that computer's own GitHub CLI, asked there;
  // the answer says only whether it was kept, never a token.
  "inf:devices:forge-sign-in-cli": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64), forgeHostSchema]),
    response: forgeCliSignInResultSchema,
  },
  // GitLab or GitHub Enterprise there, from computer-forge-servers: the key
  // rides once to that computer and the answer never carries it; GitLab's
  // browser code runs there and its code to read rides `inf:devices:sign-in`.
  "inf:devices:forge-sign-in-key": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64), forgeKeySignInSchema]),
    response: forgeKeySignInResultSchema,
  },
  "inf:devices:forge-sign-in-browser": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64), forgeBrowserSignInSchema]),
    response: z.object({ signInId: signInIdSchema }),
  },
  "inf:devices:forge-sign-out": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64), forgeHostSchema]),
    response: okSchema,
  },
  // A custom API connection on a computer that runs work. The form is drawn
  // here; that computer reads the address, checks each model and keeps the
  // key. The key and headers ride once inside connect and are kept nowhere
  // here. A computer older than CUSTOM_API_SIGN_INS_SINCE refuses them.
  "inf:devices:custom:address": {
    effect: "read",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64), z.string().max(4096)]),
    response: customApiAddressSchema,
  },
  "inf:devices:custom:profiles": {
    effect: "read",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64)]),
    response: z.array(customCapabilityProfileSchema),
  },
  "inf:devices:custom:review": {
    effect: "read",
    surface: "core",
    reach: "views",
    request: z.tuple([
      z.string().min(1).max(64),
      z.string().max(4096),
      customNetworkModeSchema,
      z.string().max(65536).optional(),
    ]),
    response: customApiReviewSchema,
  },
  "inf:devices:custom:connect": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64), customApiConnectInputSchema]),
    response: customApiConnectResultSchema,
  },
  "inf:devices:custom:check": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([
      z.string().min(1).max(64),
      z.string().min(1).max(128),
      z.string().min(1).max(256),
    ]),
    response: customApiViewSchema,
  },
  "inf:devices:custom:discover": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64), z.string().min(1).max(128)]),
    response: z.array(customListedModelSchema),
  },
  "inf:devices:custom:cancel": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64), z.string().min(1).max(128)]),
    response: okSchema,
  },
  "inf:devices:custom:save": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64), z.string().min(1).max(128), z.boolean()]),
    response: customApiViewSchema,
  },
  "inf:devices:custom:recheck": {
    effect: "change",
    surface: "core",
    reach: "views",
    request: z.tuple([z.string().min(1).max(64), z.string().min(1).max(256)]),
    response: customApiViewSchema,
  },
  // What this app is on its Mac (docs/view.md): the Mac that holds Firstmate,
  // or the app controlling Firstmate on another Mac and how well it hears
  // it. The shell answers it, and pushes it whole on every change.
  "inf:devices:this-mac": {
    effect: "read",
    surface: "host",
    request: z.tuple([]),
    response: thisMacSchema,
  },
  // Joins Firstmate on another Mac with a link its person pasted at this
  // app's first launch, after they confirmed it. On success the shell stops
  // this Mac's own Firstmate and the window starts over as the other Mac's.
  "inf:devices:join": {
    effect: "change",
    surface: "host",
    request: z.tuple([z.string().min(1).max(1024)]),
    response: joinOutcomeSchema,
  },
  // Join by its address (docs/view.md, "Joining by its address"): one step
  // of asking the computer at an address for a one-use link over the
  // person's own SSH - the key line, the password once, then the link,
  // which the shell holds in memory and answers only as the paste path's
  // question. `inf:devices:join-held` joins with that link, or forgets it.
  "inf:devices:join-at": {
    effect: "change",
    surface: "host",
    request: z.tuple([remoteLoginAddressSchema, joinAtOptionsSchema.optional()]),
    response: joinAtAnswerSchema,
  },
  "inf:devices:join-held": {
    effect: "change",
    surface: "host",
    request: z.tuple([z.enum(["join", "forget"])]),
    response: joinOutcomeSchema,
  },
  // Set up from your first mate's computer, at this app's first launch
  // (docs/view.md, "Joining"): this computer's addresses, its Remote Login
  // state and its check line, read without an administrator; its Sharing
  // settings on a Mac; and following along once that computer added this
  // one, which the window asks while its first launch is up.
  "inf:devices:set-up-here": {
    effect: "read",
    surface: "host",
    // The account and addresses, then the keys, read only while the aside is open.
    request: z.tuple([setUpReadsSchema]),
    response: setUpHereSchema,
  },
  "inf:devices:open-sharing": {
    effect: "change",
    surface: "host",
    request: z.tuple([]),
    response: okSchema,
  },
  "inf:devices:follow-added": {
    effect: "change",
    surface: "host",
    request: z.tuple([]),
    // `follows`: this window would follow along once added; `joins`: Join by its address works here;
    // `pastes`: Paste its link works here, as it also does while no command this window starts runs;
    // `outside`: a first mate started outside this window runs beside it, never one still starting.
    response: z.strictObject({
      followed: z.boolean(),
      follows: z.boolean(),
      joins: z.boolean(),
      pastes: z.boolean(),
      outside: z.boolean(),
    }),
  },
  // One step of Join by its address asked of the first mate a command runs
  // (docs/run.md, "Joining another computer"): it keeps this computer's SSH
  // trust and Infinitary's own key, so it signs in there and answers the
  // link to the window's program, which holds it as `inf:devices:join-at`
  // does. Only that program asks it, never the window's page
  // (`PROGRAM_ONLY_CHANNELS`).
  "inf:devices:link-at": {
    effect: "change",
    surface: "core",
    reach: "home",
    request: z.tuple([remoteLoginAddressSchema, joinAtOptionsSchema.optional()]),
    response: linkAtAnswerSchema,
  },
  // Leave: this Mac stops controlling the other one and returns to its own
  // first launch, telling that Mac first when it is in reach.
  "inf:devices:leave": {
    effect: "change",
    surface: "host",
    request: z.tuple([]),
    response: okSchema,
  },
  // Try again on the notice of a Mac whose work is not set up (docs/view.md,
  // "A Mac that runs work"): the window checks its work half and sets it up
  // again now, as it does at each welcomed connection.
  "inf:devices:set-up-work": {
    effect: "change",
    surface: "host",
    request: z.tuple([]),
    response: okSchema,
  },
  // Take over: a Mac that keeps a copy becomes the first mate's computer
  // while it is out of reach, once the person confirms it with Touch ID or
  // the password (docs/devices.md, "Taking over").
  "inf:devices:take-over": {
    effect: "change",
    surface: "host",
    request: z.tuple([]),
    response: z.strictObject({ ok: z.boolean(), text: z.string().min(1).max(600) }),
  },
} as const satisfies Record<string, ChannelDeclaration>;
