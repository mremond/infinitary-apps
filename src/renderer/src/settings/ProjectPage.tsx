import {
  advisoryWorkflowsCleared,
  advisoryWorkflowsSchema,
  clearsAdvisoryWorkflows,
  sameAdvisoryRepository,
  typedAdvisoryWorkflows,
} from "@shared/advisoryWorkflows";
import {
  BATCH_GAP_CHOICES,
  BATCH_GAP_WORDS,
  keepsCommits,
  mergeWait,
  SQUASH_ONLY_WORDS,
} from "@shared/batches";
import { CONTRIBUTION_WORDS } from "@shared/contributions";
import {
  contributorDisclosureLine,
  DEFAULT_CONTRIBUTOR_DISCLOSURE,
} from "@shared/contributorDisclosure";
import { hasChangeRequests } from "@shared/forge";
import * as m from "@shared/i18n/messages.generated";
import {
  hostTakesBatches,
  namesAdvisoryWorkflows,
  ownsBatches,
  projectDeliveryChoices,
  type RepoMoveResult,
  type RepoPolicyPatch,
  type RepoView,
  readsPullRequestChecks,
} from "@shared/repos";
import type { Rigor } from "@shared/rigor";
import type { DeviceSignIns } from "@shared/signIns";
import {
  AUTONOMY_SWITCH_NAME,
  AUTONOMY_WORDS,
  PROJECT_DELIVERY_WORDS,
  RIGOR_WORDS,
} from "@shared/vocabulary";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { Button, GroupedPills, Input, Switch } from "../design";
import { useFirstMatePlace, useHereAs } from "../devices/useFirstMatePlace";
import { AddProject } from "./AddProject";
import { BatchHoldPanel, BatchWaitPanel } from "./BatchHoldPanel";
import { configureProject } from "./configureProject";
import { FIRSTMATE_SELECT_STYLE } from "./GeneralTab";
import { MoveRepository } from "./MoveRepository";
import { ProjectCostLimit } from "./ProjectCostLimit";
import { ProjectTags } from "./ProjectTags";
import { PROJECT_COST_WORDS } from "./projectCostWords";
import type { GroupProject, ProjectEntry } from "./projectGroups";
import {
  BATCH_OWN_WORDS,
  batchNoHostWords,
  PROJECT_POLICY_WORDS,
  PROJECT_ROW_WORDS,
  type ProjectRefusal,
  projectRefusalOf,
} from "./projectsWords";
import { RemoveProject } from "./RemoveProject";
import { RunsOnControl, runsOnDescription } from "./RunsOn";
import { ROW_GAP, SETTINGS_TOP_PAD_PX, SettingError } from "./settingRows";

/**
 * One project's own page in Settings -> Projects (design skill
 * components/projects/ProjectPage; INF-4408 from INF-4395's plan). It
 * replaces the list while it is open: Back, the heading, a Project box with
 * the project's Name, a Tags box with the project's tags, then one framed Repositories panel whose top edge is a
 * strip of tabs, one per repository, followed by Add a repository. Inside the
 * panel sit the chosen repository's Changes, Tasks and Details, then Move
 * and Remove naming that repository. A project of one repository opens the same page
 * with one tab; the personal workspace opens its read-only rows alone.
 */

const RIGOR_OPTIONS = [
  { value: "quick" as const, label: RIGOR_WORDS.quick },
  { value: "standard" as const, label: RIGOR_WORDS.standard },
  { value: "reviewed" as const, label: RIGOR_WORDS.reviewed },
];

/** What the page asks of the tab around it, which holds every repository's saved state. */
export type ProjectPageActions = {
  onBack: () => void;
  onChoose: (repoId: string) => void;
  onAdding: (adding: boolean) => void;
  onPatch: (repoId: string, changes: RepoPolicyPatch) => void;
  onRunsOn: (repoId: string, deviceId: string | null) => void;
  onAdded: (repo: RepoView, said: string, intoProject: boolean) => void;
  onRemoved: (repoId: string) => void;
  /** A repository moved from its Move line into another project. */
  onMoved: (repoId: string, moved: RepoMoveResult) => void;
  onRenamed: (projectId: string, name: string) => void;
};

export function ProjectPage({
  entry,
  chosen,
  adding,
  notice,
  repos,
  moveTargets,
  computersFor,
  runsOnError,
  refused,
  actions,
}: {
  entry: ProjectEntry;
  /** The repository whose tab is chosen. */
  chosen: RepoView;
  /** Add a repository's form shows in the panel in place of the settings. */
  adding: boolean;
  /** The confirmation of a repository just added from this page. */
  notice: string | null;
  /** Every repository listed, for Add a repository. */
  repos: RepoView[];
  /** The live projects a repository here can move into, for its Move line. */
  moveTargets: GroupProject[];
  /** Computers that run work for a repository, or null when Runs on is not drawn. */
  computersFor: (repo: RepoView) => DeviceSignIns[] | null;
  runsOnError: string | null;
  /** The chosen repository's refused save that a control names. */
  refused: ProjectRefusal | null;
  actions: ProjectPageActions;
}) {
  const several = entry.kind === "several";
  const members = several ? entry.repos : [entry.repo];
  const project: GroupProject | null = entry.project;
  const personal = chosen.kind === "personal";
  const name = several ? entry.project.name : chosen.name;
  return (
    <div data-project-page={project?.key ?? chosen.id}>
      <Button
        variant="ghost"
        size="sm"
        data-project-back=""
        onClick={actions.onBack}
        style={{ marginInlineStart: "calc(-1 * var(--space-3))", marginBottom: "var(--space-2)" }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m15 6-6 6 6 6" />
        </svg>
        {m.settingsProjectsLabel()}
      </Button>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: ROW_GAP,
        }}
      >
        <h2
          data-project-heading=""
          style={{
            margin: 0,
            fontSize: "var(--text-md)",
            fontWeight: 500,
            color: "var(--fg-1)",
            fontFamily: several ? undefined : "var(--font-mono)",
            overflowWrap: "anywhere",
          }}
        >
          {name}
        </h2>
        <span
          data-project-heading-words=""
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-xs)",
            color: "var(--fg-3)",
          }}
        >
          {[
            project?.key,
            personal ? null : m.settingsProjectsRepositoryCount({ count: members.length }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      {personal ? (
        <Box data={chosen.id}>
          <RepositorySettings
            repo={chosen}
            computers={computersFor(chosen)}
            runsOnError={runsOnError}
            refused={refused}
            actions={actions}
            withName={false}
          />
        </Box>
      ) : (
        <>
          <GroupLabel>{m.settingsProjectsProjectLabel()}</GroupLabel>
          <Box name>
            {several ? (
              <NameForm
                key={entry.project.id}
                value={entry.project.name}
                description={m.settingsProjectsGroupNameDescription({ key: entry.project.key })}
                surface="project-name"
                save={async (next) => {
                  const renamed = await window.infinitary.projects.rename(entry.project.id, next);
                  actions.onRenamed(entry.project.id, renamed.name);
                }}
              />
            ) : (
              <NameForm
                key={chosen.id}
                value={chosen.name}
                mono
                description={m.settingsProjectsNameDescription()}
                surface="project-name"
                save={async (next) => {
                  await window.infinitary.repos.configure(chosen.id, { name: next });
                }}
              />
            )}
          </Box>
          {project && (
            <>
              <GroupLabel>{m.settingsProjectsTagsLabel()}</GroupLabel>
              <Box>
                <ProjectTags projectId={project.id} projectName={project.name} />
              </Box>
            </>
          )}
          <GroupLabel>{m.settingsProjectsRepositoriesLabel()}</GroupLabel>
          <RepositoryPanel
            members={members}
            chosen={chosen}
            into={project}
            adding={adding}
            notice={notice}
            repos={repos}
            moveTargets={moveTargets}
            computersFor={computersFor}
            runsOnError={runsOnError}
            refused={refused}
            withName={several}
            actions={actions}
          />
        </>
      )}
    </div>
  );
}

/** A labeled hairline box, like the list's own. */
function Box({ children, data, name }: { children: ReactNode; data?: string; name?: boolean }) {
  return (
    <div
      data-project={data}
      data-project-box={name ? "" : undefined}
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-m)",
        padding: "0 18px",
        marginBottom: ROW_GAP,
      }}
    >
      {/* The first row's hairline would double the box's own edge. */}
      <div style={{ marginTop: -1 }}>{children}</div>
    </div>
  );
}

/** A group's label: small, spaced capitals, as the tab's own label. */
function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div
      data-project-group-label=""
      style={{
        padding: "var(--space-3) 0 var(--space-2)",
        fontSize: "var(--text-xs)",
        fontWeight: 500,
        letterSpacing: "var(--tracking-label)",
        textTransform: "uppercase",
        color: "var(--fg-3)",
      }}
    >
      {children}
    </div>
  );
}

/**
 * The Repositories panel: its top edge is the strip of tabs, which stays at
 * the top of the view while the page scrolls, and the chosen repository's
 * settings sit inside the same frame.
 */
function RepositoryPanel({
  members,
  chosen,
  into,
  adding,
  notice,
  repos,
  moveTargets,
  computersFor,
  runsOnError,
  refused,
  withName,
  actions,
}: {
  members: RepoView[];
  chosen: RepoView;
  into: GroupProject | null;
  adding: boolean;
  notice: string | null;
  repos: RepoView[];
  moveTargets: GroupProject[];
  computersFor: (repo: RepoView) => DeviceSignIns[] | null;
  runsOnError: string | null;
  refused: ProjectRefusal | null;
  withName: boolean;
  actions: ProjectPageActions;
}) {
  const ids = useId();
  const tabId = (id: string) => `${ids}-tab-${id}`;
  const panelId = `${ids}-panel`;
  const list = useRef<HTMLDivElement>(null);
  // Where focus goes after the panel changes, decided in one place after
  // each render so the order of effects cannot lose it: a repository just
  // added is chosen and its confirmation shown, so focus goes to its tab;
  // closing the form without adding (Cancel, or the Add button again) puts
  // focus back on Add a repository. Either way the keys keep working on the
  // page instead of falling to the window, where Escape would close Settings.
  const focusChosen = useRef(false);
  const seenNotice = useRef<string | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const wasAdding = useRef(adding);
  useEffect(() => {
    if (notice && notice !== seenNotice.current) focusChosen.current = true;
    seenNotice.current = notice;
    const closed = wasAdding.current && !adding;
    wasAdding.current = adding;
    if (adding) return;
    if (focusChosen.current) {
      focusChosen.current = false;
      list.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    } else if (closed) addButton.current?.focus();
  });
  // A repository removed from a project of several leaves another chosen:
  // focus goes to its tab, for the same reason.
  const panelActions: ProjectPageActions = {
    ...actions,
    onRemoved: (repoId) => {
      focusChosen.current = true;
      actions.onRemoved(repoId);
    },
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key) || event.metaKey || event.ctrlKey || event.altKey) return;
    const nodes = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []);
    const at = nodes.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    event.preventDefault();
    const to =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? nodes.length - 1
          : (at + (event.key === "ArrowRight" ? 1 : -1) + nodes.length) % nodes.length;
    nodes[to]?.focus();
  };
  return (
    <div
      data-project-repositories={into?.key ?? chosen.id}
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-m)",
        marginBottom: ROW_GAP,
      }}
    >
      <div
        data-repository-strip=""
        style={{
          position: "sticky",
          top: -SETTINGS_TOP_PAD_PX,
          zIndex: 1,
          display: "flex",
          alignItems: "flex-end",
          flexWrap: "wrap",
          columnGap: "var(--space-1)",
          padding: "var(--space-1) var(--space-3) 0",
          background: "var(--bg-1)",
          borderBottom: "1px solid var(--line-1)",
          borderRadius: "var(--radius-m) var(--radius-m) 0 0",
        }}
      >
        <div
          ref={list}
          role="tablist"
          aria-label={m.settingsProjectsRepositoriesLabel()}
          onKeyDown={onKeyDown}
          style={{
            display: "flex",
            alignItems: "flex-end",
            flexWrap: "wrap",
            columnGap: "var(--space-1)",
            minWidth: 0,
          }}
        >
          {members.map((repo) => {
            const selected = !adding && repo.id === chosen.id;
            return (
              <button
                key={repo.id}
                id={tabId(repo.id)}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={repo.id === chosen.id ? 0 : -1}
                data-repository-tab={repo.id}
                onClick={() => {
                  if (adding) actions.onAdding(false);
                  if (repo.id !== chosen.id) actions.onChoose(repo.id);
                }}
                style={stripTabStyle(selected)}
              >
                {repo.name}
              </button>
            );
          })}
        </div>
        {into && (
          <button
            type="button"
            ref={addButton}
            data-add-repository-tab=""
            aria-expanded={adding}
            onClick={() => actions.onAdding(!adding)}
            style={{
              ...stripTabStyle(adding),
              fontFamily: "inherit",
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-1)",
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M5 12h14M12 5v14" />
            </svg>
            {m.settingsAddRepositoryTitle()}
          </button>
        )}
      </div>
      {adding && into ? (
        <div data-repository-add="">
          <AddProject repos={repos} into={into} onAdded={actions.onAdded} />
          {/* Inset less than the form by the ghost button's own padding, so its word lines up with the form's. */}
          <div style={{ padding: "0 var(--space-4) var(--space-3) var(--space-1)" }}>
            <Button
              variant="ghost"
              size="sm"
              data-add-repository-cancel=""
              onClick={() => actions.onAdding(false)}
            >
              {m.settingsProjectsFolderCancel()}
            </Button>
          </div>
        </div>
      ) : (
        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={tabId(chosen.id)}
          data-project={chosen.id}
          style={{ padding: "0 18px 12px" }}
        >
          {notice && (
            <div
              role="status"
              data-repository-notice=""
              style={{
                fontSize: "var(--text-sm)",
                color: "var(--fg-3)",
                paddingTop: "var(--space-3)",
              }}
            >
              {notice}
            </div>
          )}
          <RepositorySettings
            key={chosen.id}
            repo={chosen}
            computers={computersFor(chosen)}
            runsOnError={runsOnError}
            refused={refused}
            actions={panelActions}
            withName={withName}
            move={{ targets: moveTargets, ownOffered: members.length > 1 }}
          />
        </div>
      )}
    </div>
  );
}

/** A tab on the strip, drawn like a task card's tabs: a brighter name and an accent line when chosen. */
function stripTabStyle(selected: boolean): React.CSSProperties {
  return {
    minWidth: 0,
    maxWidth: "100%",
    overflowWrap: "anywhere",
    textAlign: "start",
    padding: "var(--space-2) var(--space-2)",
    marginBottom: -1,
    border: 0,
    borderBottom: `2px solid ${selected ? "var(--accent)" : "transparent"}`,
    background: "transparent",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--text-sm)",
    fontWeight: 400,
    color: selected ? "var(--fg-1)" : "var(--fg-3)",
    cursor: selected ? "default" : "pointer",
  };
}

/**
 * One repository's settings, each group under its label: Changes, Tasks and
 * Details, then Move and Remove. The personal workspace has its read-only rows alone.
 * Every row shows under the same conditions as it did in the open row.
 */
function RepositorySettings({
  repo,
  computers,
  runsOnError,
  refused,
  actions,
  withName,
  move,
}: {
  repo: RepoView;
  computers: DeviceSignIns[] | null;
  runsOnError: string | null;
  refused: ProjectRefusal | null;
  actions: ProjectPageActions;
  /** Details holds the repository's own Name: in a project of several. */
  withName: boolean;
  /** Where its Move line can take it; the personal workspace has none. */
  move?: { targets: GroupProject[]; ownOffered: boolean };
}) {
  const here = useHereAs();
  const onPatch = (changes: RepoPolicyPatch) => actions.onPatch(repo.id, changes);
  const personal = repo.kind === "personal";
  // Batches of this person's own: the app combines the approved changes, with nothing to set up.
  const ownBatch = !personal && ownsBatches(repo.delivery, repo) === true;
  const held = !personal && repo.batch?.open?.hold ? repo.batch.open : undefined;
  // A merge the host took and still reads as running: shown, with Try again, while it lasts.
  const waiting = personal ? undefined : mergeWait(repo.batch?.open);
  // A project that allows only squash merges is not offered batches.
  const squashOnly =
    !personal &&
    repo.delivery !== "queue-pr" &&
    repo.batch?.ways !== undefined &&
    !keepsCommits(repo.batch.ways);
  const autonomyLabel = repo.autonomy ? AUTONOMY_WORDS.putsInItself : AUTONOMY_WORDS.asksFirst;
  const changes = (
    <>
      <PolicyRow
        // The personal workspace is a workspace kind, not a posture, so
        // its first row is not a Delivery at all - naming it one is the
        // conflation this tab stopped making.
        title={PROJECT_POLICY_WORDS.deliveryTitle(personal)}
        description={
          personal
            ? PROJECT_POLICY_WORDS.workspace
            : PROJECT_POLICY_WORDS.delivery(
                repo.batchesOffered !== false || repo.delivery === "queue-pr",
              )
        }
        control={
          personal ? (
            <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-3)" }}>
              {PROJECT_ROW_WORDS.personal}
            </span>
          ) : (
            <GroupedPills
              name={m.settingsProjectsDeliveryTitle()}
              htmlName={`delivery-${repo.id}`}
              value={repo.delivery}
              options={projectDeliveryChoices(repo).map((value) => ({
                value,
                label: PROJECT_DELIVERY_WORDS[value],
              }))}
              onChange={(delivery) => onPatch({ delivery })}
            />
          )
        }
      />
      {!personal && repo.contribution?.fork && (
        <PolicyRow
          title={CONTRIBUTION_WORDS.target}
          description={CONTRIBUTION_WORDS.description}
          control={
            <GroupedPills
              name={CONTRIBUTION_WORDS.target}
              htmlName={`contribution-${repo.id}`}
              value={repo.contribution.destination ?? ""}
              options={[
                { value: "upstream", label: CONTRIBUTION_WORDS.upstream },
                { value: "fork", label: CONTRIBUTION_WORDS.fork },
              ]}
              onChange={(contributionDestination) => {
                const target = contributionDestination
                  ? repo.contribution?.[contributionDestination]
                  : undefined;
                if (contributionDestination && target)
                  onPatch({
                    contributionDestination,
                    advisoryWorkflowsCleared: advisoryWorkflowsCleared(repo, target.origin),
                  });
              }}
            />
          }
        />
      )}
      {!personal && repo.contribution?.fork && refused === "advisory-reset" && (
        <SettingError error={PROJECT_POLICY_WORDS.refused(refused)} surface="contribution-target" />
      )}
      {!personal &&
        repo.contribution?.fork &&
        [repo.contribution.upstream, repo.contribution.fork].some((project) =>
          clearsAdvisoryWorkflows(repo, project.origin),
        ) && <AdvisoryClearsNote words={PROJECT_POLICY_WORDS.advisoryClearsTarget} id={repo.id} />}
      {!personal &&
        repo.batchesOffered !== false &&
        repo.origin &&
        repo.host &&
        !hostTakesBatches(repo.host) && (
          <BatchNote words={batchNoHostWords()} data="no-host" id={repo.id} />
        )}
      {squashOnly && <BatchNote words={SQUASH_ONLY_WORDS} data="squash-only" id={repo.id} />}
      {ownBatch && <BatchNote words={BATCH_OWN_WORDS.note} data="own-batch" id={repo.id} />}
      {held?.hold && (
        <BatchHoldPanel
          repo={repo}
          batch={{ ...held, hold: held.hold }}
          fixes={repo.batch?.fixes}
        />
      )}
      {waiting && repo.batch?.open && (
        <BatchWaitPanel repo={repo} batch={repo.batch.open} wait={waiting} />
      )}
      {ownBatch && (
        <PolicyRow
          title={BATCH_GAP_WORDS.title}
          description={BATCH_GAP_WORDS.description}
          wrapsBesideControl
          control={
            <BatchGapPicker gap={repo.batchGap} onChange={(batchGap) => onPatch({ batchGap })} />
          }
        />
      )}
      {/* Right below Where changes go and its notes, since it says how those changes merge. */}
      {readsPullRequestChecks(repo) && (
        <PolicyRow
          title={PROJECT_POLICY_WORDS.checksTitle}
          description={PROJECT_POLICY_WORDS.checks(repo.noChecks)}
          wrapsBesideControl
          control={
            <Switch
              checked={!repo.noChecks}
              aria-label={PROJECT_POLICY_WORDS.checksTitle}
              onChange={(requireChecks) => onPatch({ requireChecks })}
            />
          }
        />
      )}
      {/* Beside Require pull request checks: both say which checks hold a merge. */}
      {namesAdvisoryWorkflows(repo) && (
        <AdvisoryWorkflows
          repo={repo}
          refused={refused === "advisory-reset" ? null : refused}
          onPatch={onPatch}
        />
      )}
      <PolicyRow
        title={AUTONOMY_SWITCH_NAME}
        description={PROJECT_POLICY_WORDS.asks(personal, repo.autonomy)}
        control={
          personal ? (
            <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-3)" }}>
              {autonomyLabel}
            </span>
          ) : (
            <Switch
              checked={!repo.autonomy}
              label={autonomyLabel}
              labelPosition="before"
              aria-label={AUTONOMY_SWITCH_NAME}
              onChange={(asksFirst) => onPatch({ autonomy: !asksFirst })}
            />
          )
        }
      />
      <PolicyRow
        title={PROJECT_POLICY_WORDS.rigorTitle}
        description={PROJECT_POLICY_WORDS.rigor(personal)}
        control={
          personal ? (
            <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-3)" }}>
              {PROJECT_POLICY_WORDS.rigorNone}
            </span>
          ) : (
            <GroupedPills
              name={m.settingsProjectsCare()}
              htmlName={`rigor-${repo.id}`}
              value={(repo.rigor ?? "standard") as Rigor}
              options={RIGOR_OPTIONS}
              onChange={(value) => onPatch({ rigor: value as Rigor })}
            />
          )
        }
      />
      {!personal && repo.host && hasChangeRequests(repo.host.kind) && (
        <ContributorDisclosure repo={repo} onPatch={onPatch} />
      )}
      {!personal && repo.delivery === "local-only" && repo.rigor === "reviewed" && (
        <div
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--warn)",
            paddingBottom: "var(--space-2)",
          }}
        >
          {PROJECT_POLICY_WORDS.carefulLocal}
        </div>
      )}
    </>
  );
  const costLimit = !personal && repo.costLimit !== undefined;
  const tasks = (
    <>
      {computers && (
        <PolicyRow
          title={m.settingsRunsOnLabel()}
          description={here(runsOnDescription(repo))}
          control={
            <RunsOnControl
              repo={repo}
              computers={computers}
              onChoose={(deviceId) => actions.onRunsOn(repo.id, deviceId)}
            />
          }
        />
      )}
      <SettingError error={runsOnError} surface="runs-on" />
      {costLimit && repo.costLimit !== undefined && (
        <PolicyRow
          title={PROJECT_COST_WORDS.title}
          description={PROJECT_COST_WORDS.description}
          control={
            <ProjectCostLimit
              id={repo.id}
              limit={repo.costLimit}
              onChange={(costLimit) => onPatch({ costLimit })}
            />
          }
        />
      )}
    </>
  );
  if (personal) {
    return (
      <>
        {changes}
        {tasks}
      </>
    );
  }
  return (
    <>
      <GroupLabel>{m.settingsProjectsChangesLabel()}</GroupLabel>
      {changes}
      {(computers || costLimit || runsOnError) && (
        <>
          <GroupLabel>{m.settingsProjectsTasksLabel()}</GroupLabel>
          {tasks}
        </>
      )}
      <GroupLabel>{m.settingsProjectsDetailsLabel()}</GroupLabel>
      <ProjectDetails repo={repo} withName={withName} />
      {move && (
        <MoveRepository
          repo={repo}
          targets={move.targets}
          ownOffered={move.ownOffered}
          onMoved={(moved) => actions.onMoved(repo.id, moved)}
        />
      )}
      <RemoveProject repo={repo} onRemoved={() => actions.onRemoved(repo.id)} />
    </>
  );
}

/**
 * The project's Name with its own Save: a project of several takes a name
 * of its own; a project of one shares its name with its repository, so its
 * Name renames both together.
 */
function NameForm({
  value,
  description,
  mono,
  surface,
  save,
}: {
  value: string;
  description: string;
  mono?: boolean;
  surface: string;
  save: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => setName(value), [value]);
  const changed = name.trim() !== "" && name.trim() !== value;
  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await save(name);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (changed && !saving) void submit();
      }}
    >
      <PolicyRow
        title={m.settingsProjectsName()}
        description={description}
        control={
          <span style={{ display: "flex", gap: "var(--space-2)" }}>
            <Input
              aria-label={m.settingsProjectsNameLabel()}
              mono={mono}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={!changed || saving}
              pending={saving}
            >
              {m.settingsProjectsFolderSave()}
            </Button>
          </span>
        }
      />
      <SettingError error={error} surface={surface} />
    </form>
  );
}

function ProjectDetails({ repo, withName }: { repo: RepoView; withName: boolean }) {
  const place = useFirstMatePlace();
  const [name, setName] = useState(repo.name);
  const [scope, setScope] = useState(repo.scope ?? "");
  const [path, setPath] = useState(repo.path);
  const [origin, setOrigin] = useState(repo.origin ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setName(repo.name);
    setScope(repo.scope ?? "");
    setPath(repo.path);
    setOrigin(repo.origin ?? "");
  }, [repo.name, repo.scope, repo.path, repo.origin]);
  const changed =
    (withName && name !== repo.name) ||
    (scope || null) !== (repo.scope ?? null) ||
    path !== repo.path ||
    (origin || null) !== repo.origin;
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await configureProject(repo.id, {
        ...(withName && name !== repo.name ? { name } : {}),
        ...((scope || null) !== (repo.scope ?? null) ? { scope: scope || null } : {}),
        ...(path !== repo.path ? { path } : {}),
        ...((origin || null) !== repo.origin
          ? {
              origin: origin || null,
              advisoryWorkflowsCleared: advisoryWorkflowsCleared(repo, origin || null),
              ...(!origin ? { delivery: "local-only" as const } : {}),
            }
          : {}),
      });
    } catch (caught) {
      setError(
        projectRefusalOf(caught) === "advisory-reset"
          ? PROJECT_POLICY_WORDS.addressReset
          : caught instanceof Error
            ? caught.message
            : String(caught),
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (changed && !saving) void save();
      }}
    >
      {withName && (
        <PolicyRow
          title={m.settingsProjectsName()}
          description={m.settingsProjectsNameDescription()}
          control={
            <Input
              aria-label={m.settingsProjectsNameLabel()}
              mono
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          }
        />
      )}
      <PolicyRow
        title={m.settingsProjectsScope()}
        description={m.settingsProjectsScopeDescription()}
        control={
          <textarea
            aria-label={m.settingsProjectsScope()}
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            rows={4}
            style={{
              width: "100%",
              fontFamily: "var(--font-ui)",
              fontSize: "var(--text-base)",
              color: "var(--fg-1)",
              background: "var(--surface-input)",
              border: "1px solid var(--line-1)",
              borderRadius: "var(--radius-m)",
              padding: "9px 14px",
              resize: "vertical",
            }}
          />
        }
      />
      <PolicyRow
        title={m.settingsProjectsFolder()}
        description={m.settingsProjectsFolderDescription()}
        control={
          <Input
            aria-label={m.settingsProjectsFolderLabel()}
            mono
            value={path}
            onChange={(event) => setPath(event.target.value)}
          />
        }
      />
      <PolicyRow
        title={m.settingsProjectsOrigin()}
        description={m.settingsProjectsOriginDescription({ place: place.this })}
        control={
          <Input
            aria-label={m.settingsProjectsOriginLabel()}
            mono
            value={origin}
            onChange={(event) => setOrigin(event.target.value)}
          />
        }
      />
      {clearsAdvisoryWorkflows(repo, origin || null) && (
        <AdvisoryClearsNote words={PROJECT_POLICY_WORDS.advisoryClearsAddress} id={repo.id} />
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: ROW_GAP }}>
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={!changed || saving}
          pending={saving}
        >
          {m.settingsProjectsSaveDetails()}
        </Button>
      </div>
      <SettingError error={error} surface="project-details" />
    </form>
  );
}

/**
 * Shown before the change, under the control that makes it: saving the
 * project at another repository clears its advisory workflows
 * (`clearsAdvisoryWorkflows`), and nothing restores them.
 */
function AdvisoryClearsNote({ words, id }: { words: string; id: string }) {
  return (
    <div
      data-advisory-clears
      data-repo={id}
      role="note"
      style={{
        fontSize: "var(--text-sm)",
        color: "var(--warn)",
        paddingBottom: "var(--space-3)",
      }}
    >
      {words}
    </div>
  );
}

/** One quiet line under "Where changes go" about the project's batches: how they merge, or why they are not offered. */
function BatchNote({ words, data, id }: { words: string; data: string; id: string }) {
  return (
    <div
      data-batch-note={data}
      data-repo={id}
      style={{
        width: "fit-content",
        fontSize: "var(--text-xs)",
        color: "var(--fg-2)",
        paddingBottom: "var(--space-3)",
      }}
    >
      {words}
    </div>
  );
}

/** The select's value for As soon as a change is approved: no gap. */
const NO_GAP = "now";

/**
 * When a batched project's next batch may start (docs/forge.md, "The batch
 * gap"): as soon as a change is approved, or at most every so many hours.
 * A gap the first mate set that is not among the choices is offered too.
 */
function BatchGapPicker({
  gap,
  onChange,
}: {
  gap: number | undefined;
  onChange: (gap: number | null) => void;
}) {
  const choices =
    gap && !BATCH_GAP_CHOICES.includes(gap)
      ? [...BATCH_GAP_CHOICES, gap].sort((a, b) => a - b)
      : BATCH_GAP_CHOICES;
  return (
    <select
      aria-label={BATCH_GAP_WORDS.title}
      value={gap ? String(gap) : NO_GAP}
      onChange={(event) =>
        onChange(event.target.value === NO_GAP ? null : Number(event.target.value))
      }
      style={{ ...FIRSTMATE_SELECT_STYLE, fontFamily: "var(--font-ui)" }}
    >
      <option value={NO_GAP}>{BATCH_GAP_WORDS.label(null)}</option>
      {choices.map((choice) => (
        <option key={choice} value={String(choice)}>
          {BATCH_GAP_WORDS.label(choice)}
        </option>
      ))}
    </select>
  );
}

/**
 * Disclose AI assistance (docs/forge.md, "Disclosing AI assistance"): the
 * switch turns the line off, or back on with the default line; the field
 * replaces the line with the project's own, saved by its own Save.
 */
function ContributorDisclosure({
  repo,
  onPatch,
}: {
  repo: RepoView;
  onPatch: (changes: RepoPolicyPatch) => void;
}) {
  const line = contributorDisclosureLine(repo);
  const [draft, setDraft] = useState(line ?? DEFAULT_CONTRIBUTOR_DISCLOSURE);
  useEffect(() => setDraft(line ?? DEFAULT_CONTRIBUTOR_DISCLOSURE), [line]);
  const next = draft.trim();
  const changed = line !== undefined && next !== "" && next !== line;
  return (
    <>
      <PolicyRow
        title={PROJECT_POLICY_WORDS.disclosureTitle}
        description={PROJECT_POLICY_WORDS.disclosure(line !== undefined)}
        wrapsBesideControl
        control={
          <Switch
            checked={line !== undefined}
            aria-label={PROJECT_POLICY_WORDS.disclosureTitle}
            onChange={(on) => onPatch({ contributorDisclosure: on ? null : "" })}
          />
        }
      />
      {line !== undefined && (
        <form
          style={{ display: "flex", gap: "var(--space-2)", paddingBottom: "var(--space-2)" }}
          onSubmit={(event) => {
            event.preventDefault();
            if (changed)
              onPatch({
                contributorDisclosure: next === DEFAULT_CONTRIBUTOR_DISCLOSURE ? null : next,
              });
          }}
        >
          <Input
            aria-label={PROJECT_POLICY_WORDS.disclosureLine}
            value={draft}
            maxLength={300}
            onChange={(event) => setDraft(event.target.value)}
            style={{ flex: 1 }}
          />
          <Button type="submit" size="sm" variant="secondary" disabled={!changed}>
            {m.settingsProjectsFolderSave()}
          </Button>
        </form>
      )}
    </>
  );
}

/**
 * docs/forge.md, "Advisory workflows". The field checks the list before
 * saving; the app's refusals that name this list come back as `refused`.
 * A draft keeps the address and the saved list it was typed over, and its
 * save names that repository, so one sent after the project moved is
 * refused; a draft typed for another repository, or over another list, is
 * not offered here: the field shows the saved list until it is typed again.
 */
function AdvisoryWorkflows({
  repo,
  refused,
  onPatch,
}: {
  repo: RepoView;
  refused: ProjectRefusal | null;
  onPatch: (changes: RepoPolicyPatch) => void;
}) {
  const saved = (repo.advisoryWorkflows ?? []).join(", ");
  const [draft, setDraft] = useState<{ text: string; at: string | null; over: string } | null>(
    null,
  );
  const own =
    draft?.over === saved &&
    (draft.at === repo.origin || sameAdvisoryRepository(draft.at, repo.origin))
      ? draft
      : null;
  const typed = advisoryWorkflowsSchema.safeParse(typedAdvisoryWorkflows(own?.text ?? saved));
  const changed = own !== null && typed.success && typed.data.join(", ") !== saved;
  return (
    <>
      <PolicyRow
        title={PROJECT_POLICY_WORDS.advisoryTitle}
        description={PROJECT_POLICY_WORDS.advisory}
        wrapsBesideControl
        control={null}
      />
      <form
        style={{ display: "flex", gap: "var(--space-2)", paddingBottom: "var(--space-2)" }}
        onSubmit={(event) => {
          event.preventDefault();
          if (changed && own && typed.success)
            onPatch({ advisoryWorkflows: typed.data, advisoryWorkflowsAt: own.at });
        }}
      >
        <Input
          aria-label={PROJECT_POLICY_WORDS.advisoryLabel}
          value={own?.text ?? saved}
          spellCheck={false}
          onChange={(event) => setDraft({ text: event.target.value, at: repo.origin, over: saved })}
          style={{ flex: 1, fontFamily: "var(--font-mono)" }}
        />
        <Button type="submit" size="sm" variant="secondary" disabled={!changed}>
          {m.settingsProjectsFolderSave()}
        </Button>
      </form>
      <SettingError
        error={
          !typed.success
            ? PROJECT_POLICY_WORDS.advisoryInvalid
            : refused
              ? PROJECT_POLICY_WORDS.refused(refused)
              : null
        }
        surface="advisory-workflows"
      />
    </>
  );
}

function PolicyRow({
  title,
  description,
  control,
  wrapsBesideControl,
}: {
  title: string;
  description: string;
  control: ReactNode;
  /**
   * Words that can run long wrap beside the control, which keeps its place at
   * the row's end until the words would be narrower than the Keyboard tab's
   * rows allow (INF-2114: Require pull request checks names when and by whom).
   */
  wrapsBesideControl?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 0",
        borderTop: "1px solid var(--line-1)",
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          minWidth: 0,
          ...(wrapsBesideControl ? { flex: "1 1 calc(var(--space-9) * 2)" } : {}),
        }}
      >
        <div style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--fg-1)" }}>
          {title}
        </div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-3)" }}>{description}</div>
      </div>
      {control}
    </div>
  );
}
