# One thread per captain message

INF-6115 piece 2, the plan for the captain's ask on INF-6114 to fix from the root how work is attributed to their messages.
The host used to join a later message to an earlier one's open work, so the two ended together and a card for one could close the other.
Each message is now its own thread: its own row in the first mate's open list, its own acceptance, retry and notice.

What the first mate is now told:

- The `open_asks` context block's note says one message per row, that each ends on its own accepted answering card, and that two messages about one task can end on the same card. Its rows no longer carry `later_messages`.
- The `open_work` tool description says it lists unended captain messages one per row, and that `ask` reads one whole message, its work and pictures. Its rows are flat: a message's id, when it was sent, its state, its words and its work, with no `messages` list.

The one home of each rule is the text it replaces: the `open_asks` note in the context block and the `open_work` tool description.
The first mate's fixed context grows by 4 tokens, to 19,734 (`tests/firstmate-fixed-context.test.ts`).
