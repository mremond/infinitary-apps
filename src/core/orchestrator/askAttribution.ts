import { type TObject, Type } from "typebox";
import type { BoundTool } from "../session/tools";
import type { AskCapture } from "./askCapture";

// These actions reach AskCapture.attach, including operation/card filing.
const ATTRIBUTING_TOOLS = new Set([
  "spawn_crewmate",
  "steer_crewmate",
  "interrupt_crewmate",
  "settle_task",
  "create_task",
  "update_task",
  "link_tasks",
  "emit_card",
  "app_change",
  "use_integration",
  "schedule_prompt",
  "record_knowledge",
  "flag_missed_escalation",
  "flag_duplicate",
  "personalize",
  "install_plugin",
]);

// Its rule is said once, in the first mate's core (FIRSTMATE_PROMPT_CORE's
// "EVERY TURN is about a task"), not on each of the sixteen tools that carry it.
const ASK_ID = Type.Optional(Type.String());

const UNREAD = "ask_id must name a message this turn has read.";

// These file or start work, so they may name the wake they answer (INF-2326).
const FILING_TOOLS = new Set(["spawn_crewmate", "create_task"]);

const ORIGIN = Type.Optional(
  Type.String({
    description:
      "When this turn read several automation runs, card choices or crewmate reports and no captain message: the one answered, by automation id, card id or reporting task key; the task's cards name it as the work's source.",
  }),
);

// spawn_crewmate's points at create_task's, as its title does, so the rule is said once.
const ORIGIN_AS_CREATE_TASK = Type.Optional(
  Type.String({ description: "As create_task's origin." }),
);

// Distribute over the tool union so each name keeps its own argument schema.
type AttributedTool<Tool> =
  Tool extends BoundTool<infer Name, infer Params>
    ? Params extends TObject
      ? BoundTool<
          Name,
          TObject<
            Params["properties"] & { ask_id: typeof ASK_ID } & (Name extends
                | "spawn_crewmate"
                | "create_task"
                ? { origin: typeof ORIGIN }
                : unknown)
          >
        >
      : never
    : never;

/**
 * One action's source, shared by both session backends and every attachment
 * writer. `witnessed` says whether this step read the message; one it did
 * not read may still be named when `nameRefusal` gives no reason against
 * it (INF-2664: any open message a finished reply has read).
 */
export function withAskAttribution<Tool extends BoundTool>(
  tool: Tool,
  capture: AskCapture,
  witnessed: (askId: string) => boolean,
  nameRefusal: (askId: string) => string | undefined = () => UNREAD,
): AttributedTool<Tool> {
  const parameters = {
    ...tool.parameters,
    properties: {
      ...tool.parameters.properties,
      ask_id: ASK_ID,
      ...(FILING_TOOLS.has(tool.name)
        ? { origin: tool.name === "create_task" ? ORIGIN : ORIGIN_AS_CREATE_TASK }
        : {}),
    },
  };
  return {
    ...tool,
    parameters: ATTRIBUTING_TOOLS.has(tool.name) ? parameters : tool.parameters,
    run: (params: Parameters<Tool["run"]>[0], signal?: AbortSignal) => {
      if (!ATTRIBUTING_TOOLS.has(tool.name)) return tool.run(params, signal);
      const { ask_id: declared, ...rest } = params as Record<string, unknown>;
      const filing = FILING_TOOLS.has(tool.name);
      const { origin, ...input } = rest;
      const named = filing ? origin : undefined;
      if (declared !== undefined && typeof declared !== "string")
        throw new Error("ask_id must name a read message, or be empty for unrelated work.");
      if (declared && !witnessed(declared)) {
        const refusal = nameRefusal(declared);
        if (refusal) throw new Error(refusal);
      }
      const askId = declared === undefined ? capture.current()?.id : declared || undefined;
      const declares = typeof declared === "string" && declared !== "";
      if (named === undefined || named === "")
        return capture.withAsk(
          askId,
          () => tool.run(filing ? input : rest, signal),
          undefined,
          declares,
        );
      const answered = typeof named === "string" ? capture.readOrigin(named) : undefined;
      if (!answered)
        throw new Error(
          "origin must name an automation run, card choice or crewmate report this turn has read.",
        );
      return capture.withAsk(askId, () => tool.run(input, signal), answered, declares);
    },
  } as unknown as AttributedTool<Tool>;
}
