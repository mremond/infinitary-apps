# A project can name advisory GitHub workflows

From a captain's choice to start a pilot workflow on a project without letting its checks hold that project's merges: each GitHub project can name workflow files whose checks show but never hold a merge, the check watch or a batch.
`app_change project-settings` gains `advisoryWorkflows`: the workflow files, such as `.github/workflows/early-tests.yml`, or [] to name none.
The project's current list reads as `advisoryWorkflows` in its settings value, [] when it names none.
A check from one of those workflows reads `neutral` with `advisory` naming the state the host reported, and the crew's check facts say `advisory, running` or `advisory, failed`: it holds nothing, and a reading of only advisory or skipped checks waits as an empty one does.
The check reading the first mate is told about such a reading says that no check that holds the merge has started, a skipped or advisory one aside, and the crew's check facts add that a GitHub branch rule requiring the check still holds the merge on GitHub; both are in the reading's own words, so the fixed context does not grow.
The captain makes the same change with Settings → Projects' Advisory workflows.
The words live in the project-settings action line, its one home; the fixed part grows by about 40 tokens by the app's count.
