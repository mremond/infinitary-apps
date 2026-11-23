import { describe, expect, it } from "vitest";
import {
  api,
  model,
  placed,
  sessionHostHooks,
  TASK,
} from "../../../tests/helpers/sessionHostWorld";

/**
 * A computer that runs work saving its crew's work before its home updates
 * it (docs/helper.md, "Saving its work before an update";
 * `tests/helpers/sessionHostWorld.ts`): it decides when its work is saved,
 * holds turns meanwhile, and lets the save go by itself when its home says
 * nothing after it.
 */

sessionHostHooks();

describe("a computer that runs work saving its crew's work before its update", () => {
  it("answers once the running call finished and the home has the turn's end, holds a turn asked meanwhile as unstarted, and lets the save go by itself when its home says nothing", async () => {
    const at = await placed({ updateReturnMs: 100 });
    await at.open();
    const report = at.home.hold("inf:work:report");
    model([
      { tools: [{ name: "report", args: { text: "Checked the footer." } }] },
      { text: "Fixed the footer." },
    ]);
    await at.order("inf:session:prompt", [{ orderId: "rows:1", task: TASK, text: "Go." }]);
    await report.reached;

    let answered = false;
    const saving = at.order("inf:session:save-for-update", []).then((answer) => {
      answered = true;
      return answer;
    });
    // Asked again, as after the home dropped and came back: the same save.
    const again = at.order("inf:session:save-for-update", []);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(answered).toBe(false);

    report.open();
    expect(await saving).toEqual({ stopped: [TASK] });
    expect(await again).toEqual({ stopped: [TASK] });
    // The home had the call's answer and the turn's end before the save answered.
    expect(at.home.effects.map((effect) => effect.channel)).toContain("inf:work:report");
    expect(
      at.home.events.find((record) => record.event.type === "turn_ended")?.event,
    ).toMatchObject({ turn: 1 });
    const asked = api.requests.length;

    // A turn asked while the save holds never reaches its model.
    await at.order("inf:session:prompt", [{ orderId: "rows:2", task: TASK, text: "Next." }]);
    await at.ended(2);
    expect(at.home.events.at(-1)?.event).toMatchObject({
      type: "turn_ended",
      turn: 2,
      outcome: "failed",
      unstarted: true,
    });
    expect(api.requests.length).toBe(asked);

    // The home said nothing for the computer's whole wait after the save: it
    // lets the save go, and turns run again.
    await new Promise((resolve) => setTimeout(resolve, 200));
    const { turn } = await at.order("inf:session:prompt", [
      { orderId: "rows:3", task: TASK, text: "Carry on." },
    ]);
    await at.ended(turn);
    expect(at.home.events.at(-1)?.event).toMatchObject({ type: "turn_ended", outcome: "done" });
    expect(api.requests.length).toBeGreaterThan(asked);
    // Let go already, the release answers that nothing is held.
    expect(await at.order("inf:session:release-update", [])).toEqual({ stopped: [] });
  });
});
