import type { TaskService } from "../../src/core/tasks/taskService";
import { plainProblem } from "../../src/shared/plainProblem";

/** The existing multiline reply fixture, copied from the captain's INF-1102 screenshot. */
export const REPLY_NOTE_WORDS = [
  "I've started a read-only crewmate to check the Mac mini. It's looking at:",
  "- which Linux checks your project runs today;",
  "- whether the Mac mini has room alongside the Mac checks;",
  "- the security risk of running other people's pull request code.",
  "It won't change anything on the Mac mini.",
].join("\n");

/** INF-2218's actual request, long enough to exercise the accepted two-line question fold. */
export const REPLY_READING_QUESTION =
  "also, can we improve the UI of the card that pops open when clicking on these bubbles? the card should probably render something that looks more like chat messages. give me a few prototype options to choose between";

/** Real saved-round shapes through the task owner, not a replacement reply store or renderer hook. */
export function seedReplyReading(tasks: TaskService) {
  const problemWords = plainProblem(undefined);
  const at = Date.now();
  for (const [index, round] of [
    {
      id: "reading-long",
      text: REPLY_READING_QUESTION,
      reply: { text: REPLY_NOTE_WORDS.replace(/\s+/g, " "), words: REPLY_NOTE_WORDS },
    },
    { id: "reading-picture", text: "", reply: { text: problemWords, problem: true } },
  ].entries()) {
    tasks.capture.openAsk({
      id: round.id,
      at: at + index,
      text: round.text,
      ...(round.text ? {} : { images: [{ mimeType: "image/png" }] }),
    });
    tasks.capture.setAskReply(round.id, round.reply);
    tasks.capture.setAskDelivery(round.id, "covered");
    tasks.capture.closeAsk(round.id, "closed");
    tasks.capture.markAnswered(round.id, null);
  }
  return { question: REPLY_READING_QUESTION, words: REPLY_NOTE_WORDS, problemWords };
}
