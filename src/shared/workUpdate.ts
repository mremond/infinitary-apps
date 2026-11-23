import { z } from "zod";
import { placedTaskIdSchema } from "./workIdentity";

/**
 * How long an update has to come back connected (docs/devices.md, "Updating
 * over the connection"; docs/helper.md, "A copy that does not start"): the
 * home waits this long for the computer on its version, and the computer
 * goes back to the copy it kept when the new one has not connected by then.
 */
export const UPDATE_RETURN_MS = 3 * 60_000;

/** Saves the crew's work on a computer before its home updates it (`work-update-saving.md`). */
export const WORK_SAVE_ORDER = "inf:session:save-for-update";
/** Lets that save go, after an update that did not replace the copy or Update later. */
export const WORK_RELEASE_ORDER = "inf:session:release-update";

/** What either order answers: each task whose turn the save stopped there. */
const savedTurnsSchema = z.object({ stopped: z.array(placedTaskIdSchema) });

/** The two orders a home asks a computer that runs work around its update, in `workOrders`. */
export const updateSaveOrders = {
  /**
   * Its home is about to update it (docs/helper.md, "Saving its work before
   * an update"; `work-update-saving.md`): no turn starts here, each one
   * running stops where nothing is lost, and the answer comes once every
   * stopped turn's end is written here and the home has it. `stopped` names
   * each task whose turn it stopped. A second ask joins the first; once
   * saved, nothing from the home for `UPDATE_RETURN_MS` lets it go here.
   */
  [WORK_SAVE_ORDER]: { effect: "change", request: z.tuple([]), response: savedTurnsSchema },
  /**
   * The update did not replace this copy, or was let go (Update later): a
   * turn still stopping goes on as if never asked, and turns start here
   * again. `stopped` names each task whose turn the save stopped.
   */
  [WORK_RELEASE_ORDER]: { effect: "change", request: z.tuple([]), response: savedTurnsSchema },
} as const;
