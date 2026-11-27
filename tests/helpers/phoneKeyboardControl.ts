import type { IncomingMessage, ServerResponse } from "node:http";
import type { PhoneChord, PhoneKeyWitness } from "./phoneKeyboard";
import { phoneKeyboardDiagnostic, phoneKeyboardError } from "./phoneKeyboardDiagnostics";

export type PhoneKeyboardControls = {
  keyboardClosed?(): Promise<void>;
  keyboardBeforeLaunch?(): Promise<{ generation: number }>;
  keyboardAttachment?(attached: boolean): Promise<{ attached: boolean }>;
  keyboardReady?(chord: PhoneChord, diagnosticId: string): Promise<PhoneKeyWitness>;
};

export async function phoneKeyboardControl(
  command: string | undefined,
  request: IncomingMessage,
  controls: PhoneKeyboardControls | undefined,
  response: ServerResponse,
): Promise<{ check: string; result: unknown }> {
  const header = request.headers["x-phone-keyboard-diagnostic-id"];
  const diagnostic = phoneKeyboardDiagnostic(
    command ?? "unknown",
    typeof header === "string" ? header : undefined,
  );
  const aborted = () => diagnostic("request-aborted");
  const finished = () => diagnostic("response-finished", { status: response.statusCode });
  const closed = () => {
    diagnostic("response-closed", {
      finished: response.writableFinished,
      requestComplete: request.complete,
    });
    request.off("aborted", aborted);
    response.off("finish", finished);
  };
  request.once("aborted", aborted);
  response.once("finish", finished);
  response.once("close", closed);
  diagnostic("request-start");
  try {
    const result = await executePhoneKeyboardControl(command, request, diagnostic.id, controls);
    diagnostic("owner-completed", { responseClosed: response.destroyed });
    return result;
  } catch (error) {
    diagnostic("owner-failed", {
      responseClosed: response.destroyed,
      errors: phoneKeyboardError(error),
    });
    throw error;
  }
}

async function executePhoneKeyboardControl(
  command: string | undefined,
  request: IncomingMessage,
  diagnosticId: string,
  controls?: PhoneKeyboardControls,
): Promise<{ check: string; result: unknown }> {
  if (command === "keyboard-before-launch") {
    if (!controls?.keyboardBeforeLaunch)
      throw new Error("No simulator keyboard observer is available");
    return { check: command, result: await controls.keyboardBeforeLaunch() };
  }
  if (command === "keyboard-attach" || command === "keyboard-detach") {
    if (!controls?.keyboardAttachment) throw new Error("No owned simulator keyboard is available");
    return {
      check: command,
      result: await controls.keyboardAttachment(command === "keyboard-attach"),
    };
  }
  if (command !== "keyboard-ready") throw new Error("Unknown keyboard control request");
  if (!controls?.keyboardReady) throw new Error("No simulator keyboard observer is available");
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString();
    if (body.length > 1024) throw new Error("A keyboard request is too large");
  }
  const chord = JSON.parse(body);
  if (
    typeof chord.key !== "string" ||
    (chord.key.length !== 1 &&
      !["leftArrow", "rightArrow", "upArrow", "downArrow"].includes(chord.key)) ||
    !Array.isArray(chord.modifiers) ||
    !chord.modifiers.every(
      (value: unknown) =>
        typeof value === "string" && ["cmd", "shft", "opt", "ctrl"].includes(value),
    )
  )
    throw new Error("A keyboard request must name one key and its modifiers");
  const validated: PhoneChord = { key: chord.key, modifiers: [...chord.modifiers] };
  return {
    check: "keyboard-registration",
    result: await controls.keyboardReady(validated, diagnosticId),
  };
}
