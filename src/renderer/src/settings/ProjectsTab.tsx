import * as m from "@shared/i18n/messages.generated";
import type { RepoPolicyPatch, RepoView } from "@shared/repos";
import type { ProjectView } from "@shared/tasks";
import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useShellStore } from "../app/store";
import { Button, Input } from "../design";
import { useCutWords } from "../design/core/overflowTitle";
import { isView } from "../devices/viewWords";
import { AddProject } from "./AddProject";
import { FOLDER_THERE_WORDS } from "./addProjectWords";
import { configureProject } from "./configureProject";
import { ProjectPage, type ProjectPageActions } from "./ProjectPage";
import { type GroupProject, type ProjectEntry, projectEntries } from "./projectGroups";
import {
  PROJECT_ROW_WORDS,
  type ProjectRefusal,
  projectRefusalOf,
  projectRowWords,
} from "./projectsWords";
import { runsOnWhere, useWorkComputers } from "./RunsOn";
import { LABEL_GAP, ROW_GAP, SettingError } from "./settingRows";
import { useSettingSave } from "./useSettingSave";

/**
 * The Projects settings tab: the managed fleet (decision D-8, fleet-root
 * revision). Setup, settings and removal share the `app_change` catalog with
 * Firstmate. One list box holds every project, one line each, Add project
 * and, on one line under it, where new projects go (INF-1495, direction A).
 * A line says only how the project differs from a new one
 * (`projectRowWords`); pressing it replaces the list with that project's own
 * page (`ProjectPage`, INF-4408), whose rows write the same policy
 * `app_change project-settings` already writes. Every sign-in where projects
 * live, this computer's and each other computer's own, is in Settings ->
 * Integrations, so this tab holds none.
 */

const chevron = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m9 6 6 6-6 6" />
  </svg>
);

function applyPatch(repo: RepoView, patch: RepoPolicyPatch): RepoView {
  return {
    ...repo,
    costLimit: patch.costLimit === undefined ? repo.costLimit : patch.costLimit,
    delivery: patch.delivery ?? repo.delivery,
    ...(patch.contributionDestination && repo.contribution
      ? { contribution: { ...repo.contribution, destination: patch.contributionDestination } }
      : {}),
    autonomy: patch.autonomy ?? repo.autonomy,
    rigor: patch.rigor === undefined ? repo.rigor : patch.rigor,
  };
}

const POLICY_BATCH_MS = 200;

/**
 * Drain queued policy patches. Used on debounce fire and on unmount (tab
 * switch). Configure rejection is swallowed the same way the live flush
 * does - an unhandled reject would surface as a renderer error.
 */
export function drainPendingPolicy(
  pending: Map<string, RepoPolicyPatch>,
  configure: (id: string, changes: RepoPolicyPatch) => Promise<unknown>,
): Promise<void> {
  const writes: Promise<unknown>[] = [];
  for (const [id, changes] of pending) {
    pending.delete(id);
    writes.push(Promise.resolve(configure(id, changes)).catch(() => undefined));
  }
  return Promise.all(writes).then(() => undefined);
}

/**
 * The open page: its project, when the list knows it, and the repository
 * whose tab is chosen. A project of one that takes a second repository keeps
 * its page, since the page follows the project rather than its first entry.
 */
type OpenPage = { project: string | null; repo: string };

function membersOf(entry: ProjectEntry): RepoView[] {
  return entry.kind === "several" ? entry.repos : [entry.repo];
}

/** The entry an open page shows, or null once it is gone (its last repository removed). */
export function pageEntry(
  entries: readonly ProjectEntry[],
  page: OpenPage,
): { entry: ProjectEntry; chosen: RepoView } | null {
  const entry =
    (page.project ? entries.find((one) => one.project?.id === page.project) : undefined) ??
    entries.find((one) => membersOf(one).some((repo) => repo.id === page.repo));
  if (!entry) return null;
  const members = membersOf(entry);
  const chosen = members.find((repo) => repo.id === page.repo) ?? members[0];
  return chosen ? { entry, chosen } : null;
}

/**
 * The projects a repository on the page of project `from` can move into:
 * every other live project holding a repository, never the personal
 * workspace's, whose one repository is the personal kind.
 */
function moveTargets(
  projects: readonly ProjectView[],
  repos: readonly RepoView[],
  from: string | null,
): GroupProject[] {
  const personal = new Set(repos.filter((repo) => repo.kind === "personal").map((r) => r.name));
  return projects
    .filter((project) => !project.archived && project.id !== from)
    .filter((project) => {
      const names =
        project.repos?.map((repo) => repo.name) ?? (project.repo ? [project.repo.name] : []);
      return names.length > 0 && !names.some((name) => personal.has(name));
    })
    .map(({ id, key, name }) => ({ id, key, name }));
}

/** The Settings item that opens a repository's page at its held batch (`HELD_BATCH_ITEM` + its id). */
export const HELD_BATCH_ITEM = "batch:";

/** The list line an entry is drawn as, which focus goes back to from its page. */
function lineId(entry: ProjectEntry): string {
  return entry.kind === "several" ? entry.project.key : entry.repo.id;
}

export function ProjectsTab() {
  const [repos, setRepos] = useState<RepoView[]>([]);
  // The projects the repositories belong to (INF-4220), so a project of several is one line.
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [page, setPage] = useState<OpenPage | null>(null);
  const [adding, setAdding] = useState(false);
  // The confirmation for a repository just added from the page.
  const [notice, setNotice] = useState<string | null>(null);
  const focusLine = useRef<string | null>(null);
  const focusHold = useRef<string | null>(null);
  const pagePanel = useRef<HTMLDivElement>(null);
  const previousBack = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const pending = useRef(new Map<string, RepoPolicyPatch>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const writing = useRef(new Set<string>());
  // Eligible projects expose Automatic even before another computer is added.
  const computers = useWorkComputers();
  const [runsOnError, setRunsOnError] = useState<string | null>(null);
  // A refused save whose reason a control names, until the page changes or that project's next save.
  const [refused, setRefused] = useState<{ repoId: string; refusal: ProjectRefusal } | null>(null);
  const folder = useProjectsFolder();
  const folderPath = folder.value?.path ?? null;

  useEffect(() => {
    const refresh = () => {
      // Open arrivals against both lists together. A repository-only result can
      // open a provisional page whose key changes when its project arrives.
      void Promise.all([
        window.infinitary.repos.list(),
        window.infinitary.projects.list().catch(() => undefined),
      ]).then(([nextRepos, nextProjects]) => {
        setRepos(nextRepos);
        if (nextProjects) setProjects(nextProjects);
      });
    };
    refresh();
    const off = window.infinitary.events.on((event) => {
      if (event.type === "repo_setup" || event.type === "repo_unregistered") refresh();
      if (event.type === "repo_configured" && !writing.current.has(event.repoId)) refresh();
      if (event.type === "repo_runs_on" || event.type === "repo_batch") refresh();
    });
    return () => {
      off();
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
      // Tab switch unmounts this section: flush pending patches so they land.
      void drainPendingPolicy(pending.current, configureProject);
    };
  }, []);

  const flush = (id: string) => {
    timers.current.delete(id);
    const changes = pending.current.get(id);
    if (!changes) return;
    const slice = new Map<string, RepoPolicyPatch>([[id, changes]]);
    pending.current.delete(id);
    writing.current.add(id);
    void drainPendingPolicy(slice, (repoId, patch) =>
      configureProject(repoId, patch).then(
        (updated) => {
          setRepos((current) => current.map((repo) => (repo.id === updated.id ? updated : repo)));
          return updated;
        },
        (caught: unknown) => {
          const refusal = projectRefusalOf(caught);
          if (refusal) setRefused({ repoId, refusal });
          void window.infinitary.repos.list().then(setRepos);
        },
      ),
    ).finally(() => {
      writing.current.delete(id);
    });
  };

  const patch = (id: string, changes: RepoPolicyPatch) => {
    setRefused((current) => (current?.repoId === id ? null : current));
    setRepos((current) =>
      current.map((repo) => (repo.id === id ? applyPatch(repo, changes) : repo)),
    );
    pending.current.set(id, { ...pending.current.get(id), ...changes });
    const existing = timers.current.get(id);
    if (existing) clearTimeout(existing);
    timers.current.set(
      id,
      setTimeout(() => {
        flush(id);
      }, POLICY_BATCH_MS),
    );
  };

  const open = (next: OpenPage | null, heldBatch: string | null = null) => {
    focusHold.current = heldBatch;
    setPage(next);
    setAdding(false);
    setNotice(null);
    setRunsOnError(null);
    setRefused(null);
  };

  // A project or repository just added. Its project is read first, so the
  // page it opens is its project's. Added from Add project, the new
  // project's page opens, as its row opened before, with Add project's
  // confirmation in its panel, since the form is no longer in view. Added from a page's Add
  // a repository and joined to that project, the page shows its tab chosen,
  // with the confirmation in the panel; otherwise (already added elsewhere,
  // or the projects unread) the form stays, its own confirmation with it.
  const added = (repo: RepoView, said: string, intoProject: boolean) => {
    const listIt = () =>
      setRepos((current) =>
        current.some((entry) => entry.id === repo.id) ? current : [...current, repo],
      );
    void window.infinitary.projects.list().then(
      (next) => {
        listIt();
        setProjects(next);
        const joined = next.find(
          (one) => !one.archived && one.repos?.some((r) => r.name === repo.name),
        );
        if (intoProject) {
          if (joined && (joined.repos?.length ?? 0) > 1) {
            setPage({ project: joined.id, repo: repo.id });
            setAdding(false);
            setNotice(said);
          }
        } else {
          open({ project: joined?.id ?? null, repo: repo.id });
          setNotice(said);
        }
      },
      () => {
        listIt();
        if (intoProject) return;
        open({ project: null, repo: repo.id });
        setNotice(said);
      },
    );
  };

  const chooseRunsOn = (id: string, deviceId: string | null) => {
    setRunsOnError(null);
    setRepos((current) =>
      current.map((repo) => (repo.id === id ? { ...repo, runsOn: deviceId } : repo)),
    );
    void window.infinitary.devices.runsOn(id, deviceId).then(
      (updated) =>
        setRepos((current) => current.map((repo) => (repo.id === updated.id ? updated : repo))),
      (caught: unknown) => {
        setRunsOnError(caught instanceof Error ? caught.message : String(caught));
        void window.infinitary.repos.list().then(setRepos);
      },
    );
  };

  const entries = projectEntries(repos, projects);
  const shown = page ? pageEntry(entries, page) : null;
  // A project a card or a panel named (`settingsItem`): its page opens, by
  // the project's id or key or a repository's id, once the list is read.
  const arrival = useShellStore((s) =>
    s.settingsItem?.section === "projects" ? s.settingsItem.item : null,
  );
  useEffect(() => {
    if (arrival === null || repos.length === 0) return;
    // `batch:<repository>` opens that repository's page at its held batch (the Batches panel).
    const heldBatch = arrival.startsWith(HELD_BATCH_ITEM)
      ? arrival.slice(HELD_BATCH_ITEM.length)
      : null;
    const named = heldBatch ?? arrival;
    const project = projects.find((one) => one.id === named || one.key === named);
    const target = pageEntry(entries, { project: project?.id ?? null, repo: named });
    // The projects may still be unread: a project's id waits for them.
    if (!target && projects.length === 0) return;
    useShellStore.getState().clearSettingsItem();
    if (!target) return;
    open({ project: target.entry.project?.id ?? null, repo: target.chosen.id }, heldBatch);
  });
  // A held-batch arrival takes precedence over the page's default Back target.
  // A render of the same page must not move focus after that handoff.
  useEffect(() => {
    const panel = pagePanel.current;
    const back = panel?.querySelector<HTMLButtonElement>("[data-project-back]") ?? null;
    const entered = back !== previousBack.current;
    previousBack.current = back;
    const id = focusHold.current;
    const answer =
      id && id === shown?.chosen.id
        ? panel?.querySelector<HTMLButtonElement>(`[data-batch-hold="${CSS.escape(id)}"] button`)
        : null;
    if (answer) {
      focusHold.current = null;
      answer.focus();
    } else if (entered) {
      back?.focus();
    }
  });
  // A page whose project is gone (its last repository removed) gives way to the list.
  useEffect(() => {
    if (page && !shown && repos.length > 0) setPage(null);
  }, [page, shown, repos.length]);
  useEffect(() => {
    const id = focusLine.current;
    if (!id || shown) return;
    const button = list.current?.querySelector<HTMLButtonElement>(
      `[data-project-line="${CSS.escape(id)}"]`,
    );
    if (!button) return;
    focusLine.current = null;
    button.focus();
  });

  const back = () => {
    if (shown) focusLine.current = lineId(shown.entry);
    open(null);
  };
  // Escape on a page goes back to the list, not out of Settings around it.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || !shown || event.defaultPrevented) return;
    event.stopPropagation();
    back();
  };

  const computersFor = (repo: RepoView) =>
    computers?.length || (repo.kind === "project" && repo.origin) ? (computers ?? []) : null;

  if (shown) {
    const actions: ProjectPageActions = {
      onBack: back,
      onChoose: (repoId) => {
        focusHold.current = null;
        setPage((current) => (current ? { ...current, repo: repoId } : current));
        setNotice(null);
        setRunsOnError(null);
      },
      onAdding: (next) => {
        setAdding(next);
        setNotice(null);
      },
      onPatch: patch,
      onRunsOn: chooseRunsOn,
      onAdded: added,
      onRemoved: (repoId) => {
        setRepos((current) => current.filter((one) => one.id !== repoId));
        setNotice(null);
        void window.infinitary.projects.list().then(setProjects, () => undefined);
      },
      // The repository's page is now its new project's, with its tab chosen
      // and the move said in the panel.
      onMoved: (repoId, moved) => {
        void Promise.all([
          window.infinitary.repos.list(),
          window.infinitary.projects.list().catch(() => projects),
        ]).then(([nextRepos, nextProjects]) => {
          setRepos(nextRepos);
          setProjects(nextProjects);
          open({ project: moved.project.id, repo: repoId });
          setNotice(
            m.settingsProjectsMoved({
              name: moved.repos[0]?.name ?? shown.chosen.name,
              project: moved.project.name,
            }),
          );
        });
      },
      onRenamed: (projectId, name) =>
        setProjects((current) =>
          current.map((one) => (one.id === projectId ? { ...one, name } : one)),
        ),
    };
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: Escape from anywhere on the page goes back to the list.
      <div ref={pagePanel} onKeyDown={onKeyDown}>
        <ProjectPage
          key={shown.entry.project?.id ?? shown.chosen.id}
          entry={shown.entry}
          chosen={shown.chosen}
          adding={adding}
          notice={notice}
          repos={repos}
          moveTargets={moveTargets(projects, repos, shown.entry.project?.id ?? null)}
          computersFor={computersFor}
          runsOnError={runsOnError}
          refused={refused?.repoId === shown.chosen.id ? refused.refusal : null}
          actions={actions}
        />
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          fontSize: "var(--text-xs)",
          fontWeight: 500,
          letterSpacing: "var(--tracking-label)",
          textTransform: "uppercase",
          color: "var(--fg-3)",
          marginBottom: LABEL_GAP,
        }}
      >
        {m.settingsProjectsLabel()}
      </div>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-3)", marginBottom: ROW_GAP }}>
        {m.settingsProjectsIntro()}
      </div>
      <div
        ref={list}
        style={{
          background: "var(--bg-1)",
          border: "1px solid var(--line-1)",
          borderRadius: "var(--radius-m)",
          overflow: "hidden",
        }}
      >
        {repos.length === 0 && (
          <div
            style={{
              padding: "12px 18px",
              borderBottom: "1px solid var(--line-1)",
              fontSize: "var(--text-sm)",
              color: "var(--fg-3)",
            }}
          >
            {m.settingsProjectsEmpty()}
          </div>
        )}
        {entries.map((entry) => (
          <ProjectLine
            key={entry.kind === "several" ? entry.project.id : entry.repo.id}
            entry={entry}
            folder={folderPath}
            computers={entry.kind === "one" ? computersFor(entry.repo) : null}
            onOpen={() => {
              const first = membersOf(entry)[0];
              if (first) open({ project: entry.project?.id ?? null, repo: first.id });
            }}
          />
        ))}
        <AddProject repos={repos} onAdded={added} />
        <ProjectsFolderLine folder={folder} />
      </div>
    </div>
  );
}

/**
 * One project's line in the list: its name, the quiet words that say how it
 * differs from a new project, and a chevron pointing to its page. A project
 * of several names its task key and how many repositories it holds.
 */
function ProjectLine({
  entry,
  folder,
  computers,
  onOpen,
}: {
  entry: ProjectEntry;
  /** The projects folder, or null while it is unread. */
  folder: string | null;
  /** Computers that run work, or null when Runs on is not drawn. */
  computers: ReturnType<typeof useWorkComputers> | null;
  onOpen: () => void;
}) {
  const several = entry.kind === "several";
  const repo = several ? null : entry.repo;
  const words = repo
    ? projectRowWords(repo, folder, computers ? runsOnWhere(repo, computers) : null)
    : [];
  const showPath =
    repo !== null &&
    repo.kind !== "personal" &&
    folder !== null &&
    words.includes(PROJECT_ROW_WORDS.linked);
  const line = (
    <button
      type="button"
      data-project-line={lineId(entry)}
      onClick={onOpen}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        width: "100%",
        padding: "12px 18px",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "start",
        color: "inherit",
        font: "inherit",
      }}
    >
      <span style={{ display: "flex", alignItems: "baseline", gap: 12, minWidth: 0 }}>
        <span
          style={{
            fontFamily: several ? undefined : "var(--font-mono)",
            fontSize: "var(--text-sm)",
            color: "var(--fg-1)",
            whiteSpace: "nowrap",
          }}
        >
          {several ? entry.project.name : repo?.name}
        </span>
        {several ? (
          <span
            data-project-words
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-xs)",
              color: "var(--fg-3)",
              whiteSpace: "nowrap",
            }}
          >
            {entry.project.key} · {m.settingsProjectsRepositoryCount({ count: entry.repos.length })}
          </span>
        ) : (
          words.length > 0 && (
            <span
              data-project-words
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-xs)",
                color: "var(--fg-3)",
                whiteSpace: "nowrap",
              }}
            >
              {words.map((word, index) => (
                <span key={word}>
                  {index > 0 && " · "}
                  <span data-project-word>{word}</span>
                </span>
              ))}
            </span>
          )
        )}
        {showPath && (
          <span
            data-project-path
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-xs)",
              color: "var(--fg-3)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
          >
            {repo?.path}
          </span>
        )}
      </span>
      <span style={{ display: "inline-flex", color: "var(--fg-3)", flexShrink: 0 }}>{chevron}</span>
    </button>
  );
  return several ? (
    <div data-project-group={entry.project.key} style={{ borderBottom: "1px solid var(--line-1)" }}>
      {line}
    </div>
  ) : (
    <div data-project-line-of={entry.repo.id} style={{ borderBottom: "1px solid var(--line-1)" }}>
      {line}
    </div>
  );
}

/**
 * Where new projects go (design skill `components/projects/ProjectsFolder`):
 * one line under Add project naming the folder Firstmate clones into and
 * starts new projects in, picked with the system's folder picker. Choosing
 * writes nothing until the core accepts the folder; a refusal is shown under
 * the line and the line reads the saved folder again. Projects already set
 * up never move.
 */
function ProjectsFolderLine({ folder }: { folder: ReturnType<typeof useProjectsFolder> }) {
  const { refresh, save } = folder;
  const [choosing, setChoosing] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const pathCut = useCutWords(folder.value?.path);
  // A view takes the folder's path on the first mate's computer, since a
  // folder picker here shows only this computer's folders (docs/run.md).
  const there = useShellStore((s) => (isView(s.thisMac) ? s.thisMac.name : null));
  const [typed, setTyped] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveTyped = () => {
    const path = typed?.trim();
    if (!path) return;
    void save(() => window.infinitary.repos.setFolder(path)).then((saved) => {
      if (saved) setTyped(null);
    });
  };

  const choose = () => {
    if (there) {
      setTyped(folder.value?.path ?? "");
      return;
    }
    setChoosing(true);
    setPickError(null);
    void window.infinitary.app
      .chooseFolder(folder.value?.path)
      .then(
        (picked) => (picked ? save(() => window.infinitary.repos.setFolder(picked)) : false),
        () => setPickError(m.settingsProjectsFolderPickerFailed()),
      )
      .finally(() => setChoosing(false));
  };

  const useDefault = () => {
    setPickError(null);
    void save(() => window.infinitary.repos.setFolder(null));
  };

  const busy = choosing || folder.saving;
  return (
    <div
      data-setting="projects-folder"
      style={{ padding: "0 var(--space-4) var(--space-4)", fontSize: "var(--text-sm)" }}
    >
      {there && typed !== null ? (
        <form
          style={{ display: "flex", gap: "var(--space-2)" }}
          onSubmit={(event) => {
            event.preventDefault();
            saveTyped();
          }}
        >
          <Input
            aria-label={FOLDER_THERE_WORDS.label(there)}
            mono
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={folder.saving}
            autoFocus
          />
          <Button type="submit" size="sm" disabled={!typed.trim() || folder.saving}>
            {m.settingsProjectsFolderSave()}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setTyped(null)}>
            {m.settingsProjectsFolderCancel()}
          </Button>
        </form>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", minWidth: 0 }}>
          <span style={{ color: "var(--fg-3)", whiteSpace: "nowrap" }}>
            {m.settingsProjectsFolderLine()}
          </span>
          {folder.value && (
            <>
              <span
                data-projects-folder-path
                {...pathCut}
                style={{
                  minWidth: 0,
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-xs)",
                  color: "var(--fg-2)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {folder.value.path}
              </span>
              {!folder.value.custom && (
                <span
                  style={{ color: "var(--fg-3)", fontSize: "var(--text-xs)", whiteSpace: "nowrap" }}
                >
                  {m.settingsProjectsFolderDefault()}
                </span>
              )}
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={!folder.value || folder.saving}
            pending={choosing}
            pendingLabel={m.settingsProjectsFolderChoosing()}
            onClick={choose}
          >
            {m.settingsProjectsFolderChoose()}
          </Button>
          {folder.value?.custom && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={useDefault}>
              {m.settingsProjectsFolderUseDefault()}
            </Button>
          )}
        </div>
      )}
      <SettingError error={pickError ?? folder.error} />
    </div>
  );
}

/** The projects folder as Settings last read it, shared by the rows and the folder line. */
function useProjectsFolder() {
  return useSettingSave(() => window.infinitary.repos.folder());
}
