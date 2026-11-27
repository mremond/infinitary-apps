# A project's advisory workflows

Adds an optional `advisoryWorkflows` field to a project (`RepoView`): the GitHub workflow files, by their path in the repository, whose checks show on a change but never hold its merge, the check watch or a batch; absent, none.
`inf:repos:configure` takes an optional `advisoryWorkflows`: the list to keep, or an empty list to name none.
It also takes an optional `advisoryWorkflowsAt`: the address of the repository the list was named for.
The home refuses a list with its reason when the project uses another repository by then, or while a change of target project writes the project's addresses; it then applies none of the patch's other fields either.
A patch's `contributionDestination` is the exception, since the home applies it first: a patch that changes the target project and names a list for the repository it left changes the target project, then refuses the list.
A change of target project that finds the list changed while it read the target changes nothing and is refused with its own reason.
A check item in a task's or a change's check reading gains an optional `advisory`: the state the host reported for a check from one of those workflows, whose own `state` then reads `neutral`.
A home without the change sends no `advisoryWorkflows`, so a view shows none, and every check holds as before.
A home without the change reads the patch strictly, so it refuses a view's `advisoryWorkflows` or `advisoryWorkflowsAt` with its reason and changes nothing.
A view without the change ignores `advisoryWorkflows` and `advisory`, so it shows an advisory check as neutral.
