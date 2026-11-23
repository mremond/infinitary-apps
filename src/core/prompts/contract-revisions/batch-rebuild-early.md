# Rebuild a change on the open batch when it clashes

INF-6147's plan, piece 1, from the captain's ask that batches stop paying again and again to bring a large change up to date that never gets in; the captain chose to start the repair early and never hold the next batch.
A change that clashes with the open batch, left out of it or found waiting in line, now has its crewmate told at once with the new crewmate `batch-rebuild` wake: the batch's pull request, branch and version, the changes it carries, and to declare the rebuilt push with `conflictRepair` giving that version as `newBase`.
Its one home is that wake, sent once per version of the change and set of changes in the batch, and only while the captain's merge approval is kept.
A kept merge whose change was told reads stop `queue`, and its text names the version and branch to rebuild on, where it said before that nothing could be done yet; the Firstmate does nothing new with it.
The prompt and the tools are unchanged, so the fixed context does not grow.
