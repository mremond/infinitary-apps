# A change rebuilt on an open batch

A project's batch record adds the optional `rebuilds`: each crewmate told to rebuild its change on the open batch's version, with that version, its branch, the changes it carries and, once that batch merged carrying them, `merged`.
A change in line adds the optional `onBatch`: the open batch's version it was rebuilt on and the changes that version carries.
A left-out change adds the optional `rebuild`: the batch version and branch its crewmate was told to rebuild it on.
An older side ignores all three, and reads the change as an ordinary one in line or left out.
