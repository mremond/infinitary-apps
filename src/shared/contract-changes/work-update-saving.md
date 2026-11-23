A computer that runs work answers two new orders before and after its home updates it (docs/helper.md, "Saving its work before an update").
`inf:session:save-for-update` holds new turns there, stops each running turn where nothing is lost, and answers once every stopped turn's end is written there and the home has it, naming the tasks whose turn it stopped.
`inf:session:release-update` lets that save go when the update did not replace the copy or was let go, naming the same tasks.
A turn the save stopped before its model took it ends failed with the new optional `unstarted: true` on its `turn_ended` event, so the home sends its words again.
A device on the list gains the optional `updateWork`: `saving` while its crew's work is saved before its update, naming the tasks it waits for, and `resuming` after it, naming the tasks whose turn has not started again.
A new request, `inf:devices:update-later`, lets that update go while the work is being saved, answering false when none is.
A view whose hello does not list this change is sent the device list without `updateWork`, since it reads a device strictly, and never sends the request; a home without it lists no such field.
A home without this change never asks either order, and its update cuts the computer's running turns as before.
A computer without this change is never asked them, so its home cuts its running turns as before.
