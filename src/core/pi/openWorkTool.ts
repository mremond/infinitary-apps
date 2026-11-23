import { Type } from "typebox";
import type { OpenWorkAnswer, OpenWorkInput } from "../orchestrator/openWork";
import { boundTool } from "../session/tools";

/**
 * `open_work` (INF-1712): the first mate reads what is still open - the
 * captain's messages that have not ended and every open card - from the
 * app, rather than from a conversation a fold may have summarized. The
 * host renders it (`orchestrator/openWork.ts`); the read changes nothing.
 */
export function createOpenWorkTool(read: (input: OpenWorkInput) => OpenWorkAnswer) {
  const given = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : undefined;
  return boundTool({
    name: "open_work",
    label: "Open work",
    description:
      "Read open work: unended captain messages, one per row (words, state, work); open cards (revision, choices, who owes an answer). ask reads one whole message, its work and pictures; card reads an open or closed card's body and thread. For long reads pass the named next for remaining parts; read after a fold before going on. Reading grants no permission, reopens nothing.",
    parameters: Type.Object({
      ask: Type.Optional(Type.String({ description: "One message by its ask_id" })),
      card: Type.Optional(Type.String({ description: "One card by its card_id" })),
      next: Type.Optional(Type.String({ description: "The next part an earlier read named" })),
    }),
    run: async (params) => {
      const ask = given(params.ask);
      const card = given(params.card);
      const next = given(params.next);
      const answer = read({
        ...(ask ? { ask } : {}),
        ...(card ? { card } : {}),
        ...(next ? { next } : {}),
      });
      return answer.images ? { text: answer.text, images: answer.images } : { text: answer.text };
    },
  });
}
