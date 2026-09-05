import { Component, createSignal, createEffect, createMemo, For, Show, onCleanup, untrack } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { appStore, getRecentProjects, matchRecentProject, RecentProject } from "../../stores/app";
import {
  isDirectoryListingAffected,
  isPathWithinRoot,
  normalizeFsPath,
  payloadBelongsToRoot,
  type FsChangedPayload,
} from "../../fsEvents";
import { getFileIcon } from "./FileIcons";
import "./Sidebar.css";

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  extension: string | null;
}

const EXT_COLOR_MAP: Record<string, string> = {
  ts: "file-ts", tsx: "file-ts",
  js: "file-js", jsx: "file-js", mjs: "file-js", cjs: "file-js",
  html: "file-markup", htm: "file-markup", xml: "file-markup", svg: "file-markup",
  css: "file-style", scss: "file-style", less: "file-style",
  json: "file-config", jsonl: "file-config", yaml: "file-config", yml: "file-config",
  toml: "file-config", ini: "file-config", conf: "file-config", cfg: "file-config",
  properties: "file-config", env: "file-config",
  md: "file-md", markdown: "file-md", mdx: "file-md",
  rs: "file-rust",
  go: "file-go",
  py: "file-python",
  sh: "file-shell", bash: "file-shell", zsh: "file-shell", fish: "file-shell",
  csv: "file-data", tsv: "file-data", sql: "file-data", sqlite: "file-data", db: "file-data",
  png: "file-image", jpg: "file-image", jpeg: "file-image", gif: "file-image",
  webp: "file-image", bmp: "file-image", ico: "file-image",
};

function reconcileEntries(current: FileEntry[], next: FileEntry[]): FileEntry[] {
  const currentByPath = new Map(current.map((entry) => [entry.path, entry]));
  return next.map((entry) => {
    const existing = currentByPath.get(entry.path);
    if (
      existing
      && existing.name === entry.name
      && existing.is_dir === entry.is_dir
      && existing.extension === entry.extension
    ) {
      return existing;
    }
    return entry;
  });
}

function updateEntries(
  setEntries: (updater: (current: FileEntry[]) => FileEntry[]) => void,
  next: FileEntry[],
): void {
  setEntries((current) => {
    const reconciled = reconcileEntries(current, next);
    if (current.length === reconciled.length && current.every((entry, index) => entry === reconciled[index])) {
      return current;
    }
    return reconciled;
  });
}

function getFileColorClass(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext || ext === filename.toLowerCase()) return "";
  return EXT_COLOR_MAP[ext] || "";
}

const FileTreeItem: Component<{
  entry: FileEntry;
  depth: number;
  eventBatch: FsChangedPayload | undefined;
}> = (props) => {
  const [expanded, setExpanded] = createSignal(false);
  const [children, setChildren] = createSignal<FileEntry[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  let disposed = false;
  let loadGeneration = 0;

  onCleanup(() => {
    disposed = true;
    loadGeneration++;
  });

  function copyPath(e: MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(props.entry.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function loadChildren(): Promise<boolean> {
    const path = props.entry.path;
    const generation = ++loadGeneration;
    try {
      const next = await invoke<FileEntry[]>("read_dir", { path });
      if (disposed || generation !== loadGeneration || props.entry.path !== path) return false;
      updateEntries(setChildren, next);
      setLoaded(true);
      return true;
    } catch {
      if (!disposed && generation === loadGeneration && props.entry.path === path) {
        setChildren([]);
        setLoaded(false);
      }
      return false;
    }
  }

  createEffect(() => {
    const event = props.eventBatch;
    if (!event) return;
    const shouldReload = untrack(() => (
      loaded()
      && expanded()
      && props.entry.is_dir
      && isDirectoryListingAffected(props.entry.path, event)
    ));
    if (shouldReload) void loadChildren();
  });

  async function toggle() {
    if (!props.entry.is_dir) {
      const mode = appStore.detectMode(props.entry.name);
      if (mode === "image" || mode === "sqlite") {
        appStore.openFile(props.entry.path, props.entry.name, "");
        return;
      }
      const content = await invoke<string>("read_file", { path: props.entry.path });
      appStore.openFile(props.entry.path, props.entry.name, content);
      return;
    }

    if (expanded()) {
      setExpanded(false);
      return;
    }
    if (!loaded() && !await loadChildren()) return;
    setExpanded(true);
  }

  return (
    <div class="tree-item">
      <div
        class="tree-row"
        classList={{ "is-dir": props.entry.is_dir }}
        style={{ "padding-left": `${props.depth * 16 + 8}px` }}
        onClick={toggle}
      >
        <span class={`tree-icon ${props.entry.is_dir ? "file-folder" : getFileColorClass(props.entry.name)}`}>
          {getFileIcon(props.entry.name, props.entry.is_dir, expanded())}
        </span>
        <span class="tree-name" classList={{ "file-hidden": props.entry.name.startsWith(".") }} title={props.entry.name}>{props.entry.name}</span>
        <button class="tree-copy-btn" classList={{ copied: copied() }} onClick={copyPath} title="Copy path">
          <Show when={copied()} fallback={
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/>
              <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/>
            </svg>
          }>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/>
            </svg>
          </Show>
        </button>
      </div>
      <Show when={expanded()}>
        <For each={children()}>
          {(child) => (
            <FileTreeItem
              entry={child}
              depth={props.depth + 1}
              eventBatch={props.eventBatch}
            />
          )}
        </For>
      </Show>
    </div>
  );
};

function relativePath(fullPath: string, root: string): string {
  if (!root || !isPathWithinRoot(fullPath, root)) return fullPath;
  const normalizedRoot = normalizeFsPath(root);
  const relative = normalizeFsPath(fullPath).slice(normalizedRoot === "/" ? 1 : normalizedRoot.length);
  return relative.startsWith("/") ? relative.slice(1) : relative;
}

function projectName(path: string | null): string {
  if (!path) return "";
  return path.split("/").pop() || path;
}

const Sidebar: Component<{
  onOpenGitLog?: () => void;
  onOpenWorkingChanges?: () => void;
  onOpenFolder?: () => void;
  onSwitchProject?: (path: string) => void;
}> = (props) => {
  const [entries, setEntries] = createSignal<FileEntry[]>([]);
  const [searchQuery, setSearchQuery] = createSignal("");
  const [searchResults, setSearchResults] = createSignal<FileEntry[]>([]);
  const [searching, setSearching] = createSignal(false);
  const [dropdownOpen, setDropdownOpen] = createSignal(false);
  const [projectQuery, setProjectQuery] = createSignal("");
  const [eventBatch, setEventBatch] = createSignal<FsChangedPayload>();
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let searchGeneration = 0;
  let dropdownRef: HTMLDivElement | undefined;
  let projectSearchRef: HTMLInputElement | undefined;

  onCleanup(() => {
    searchGeneration++;
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  function handleClickOutside(e: MouseEvent) {
    if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
      setDropdownOpen(false);
    }
  }

  createEffect(() => {
    if (dropdownOpen()) {
      document.addEventListener("mousedown", handleClickOutside);
      queueMicrotask(() => projectSearchRef?.focus());
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
      setProjectQuery("");
    }
  });

  onCleanup(() => {
    document.removeEventListener("mousedown", handleClickOutside);
  });

  createEffect(() => {
    const path = appStore.rootPath();
    let disposed = false;
    let loadGeneration = 0;
    let unlistenFs: UnlistenFn | undefined;

    searchGeneration++;
    if (debounceTimer) clearTimeout(debounceTimer);
    setSearchQuery("");
    setSearchResults([]);
    setSearching(false);
    setEventBatch(undefined);
    setEntries([]);
    if (!path) return;

    const loadEntries = async () => {
      const generation = ++loadGeneration;
      try {
        const next = await invoke<FileEntry[]>("read_dir", { path });
        if (disposed || generation !== loadGeneration || appStore.rootPath() !== path) return;
        updateEntries(setEntries, next);
      } catch {
        if (!disposed && generation === loadGeneration && appStore.rootPath() === path) {
          setEntries([]);
        }
      }
    };

    void loadEntries();

    void (async () => {
      try {
        const unlisten = await listen<FsChangedPayload>("fs-changed", (event) => {
          if (disposed || !payloadBelongsToRoot(event.payload, path)) return;
          setEventBatch(event.payload);
          if (isDirectoryListingAffected(path, event.payload)) {
            void loadEntries();
          }
        });
        if (disposed) {
          unlisten();
          return;
        }
        unlistenFs = unlisten;
        await invoke("watch_path", { path });
        if (!disposed && appStore.rootPath() === path) {
          void loadEntries();
        }
      } catch {}
    })();

    onCleanup(() => {
      disposed = true;
      loadGeneration++;
      unlistenFs?.();
    });
  });

  function onSearchInput(value: string) {
    const query = value.trim();
    const generation = ++searchGeneration;
    setSearchQuery(value);
    if (debounceTimer) clearTimeout(debounceTimer);

    if (!query) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceTimer = setTimeout(async () => {
      const root = appStore.rootPath();
      if (!root) {
        if (generation === searchGeneration) setSearching(false);
        return;
      }
      try {
        const results = await invoke<FileEntry[]>("search_files", { root, query });
        if (
          generation !== searchGeneration
          || appStore.rootPath() !== root
          || searchQuery().trim() !== query
        ) return;
        setSearchResults(results);
      } catch {
        if (
          generation !== searchGeneration
          || appStore.rootPath() !== root
          || searchQuery().trim() !== query
        ) return;
        setSearchResults([]);
      }
      if (generation === searchGeneration) setSearching(false);
    }, 150);
  }

  async function openSearchResult(entry: FileEntry) {
    const mode = appStore.detectMode(entry.name);
    if (mode === "image" || mode === "sqlite") {
      appStore.openFile(entry.path, entry.name, "");
      return;
    }
    const content = await invoke<string>("read_file", { path: entry.path });
    appStore.openFile(entry.path, entry.name, content);
  }

  function handleOpenFolder() {
    setDropdownOpen(false);
    props.onOpenFolder?.();
  }

  function handleSwitchProject(path: string) {
    setDropdownOpen(false);
    props.onSwitchProject?.(path);
  }

  function revealProjectInFinder(e: MouseEvent) {
    e.stopPropagation();
    const root = appStore.rootPath();
    if (!root) return;
    invoke("reveal_in_finder", { path: root });
  }

  const isSearching = () => searchQuery().trim().length > 0;

  const baseRecent = createMemo<RecentProject[]>(() => {
    dropdownOpen();
    const current = appStore.rootPath();
    return getRecentProjects().filter((p) => p.path !== current);
  });

  const recentProjects = createMemo(() => {
    const q = projectQuery();
    const base = baseRecent();
    if (!q.trim()) return base;
    return base.filter((p) => matchRecentProject(p, q));
  });

  const hasRecent = () => baseRecent().length > 0;

  return (
    <div class="sidebar" style={{ width: `${appStore.sidebarWidth()}px` }}>
      <div class="sidebar-brand" data-tauri-drag-region>
        <span class="brand-name">OpenView</span>
      </div>

      <div class="project-switcher" ref={dropdownRef}>
        <div class="project-header">
          <div class="project-current" onClick={() => setDropdownOpen(!dropdownOpen())}>
            <button
              class="project-reveal-btn"
              onClick={revealProjectInFinder}
              title="Reveal in Finder"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5c0 .966.784 1.75 1.75 1.75h11.36a1.75 1.75 0 0 0 1.7-1.325l1.113-4.5A1.75 1.75 0 0 0 14.223 7H14V4.75A1.75 1.75 0 0 0 12.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2A1.75 1.75 0 0 0 5 1Zm0 1.5h3.25a.25.25 0 0 1 .2.1l.9 1.2c.33.44.85.7 1.4.7h5.5a.25.25 0 0 1 .25.25V7H4.64a1.75 1.75 0 0 0-1.7 1.325L1.5 14.1V2.75a.25.25 0 0 1 .25-.25Zm2.89 6h9.583a.25.25 0 0 1 .243.31l-1.113 4.5a.25.25 0 0 1-.243.19H2.777a.25.25 0 0 1-.243-.31l1.113-4.5a.25.25 0 0 1 .243-.19Z"/>
              </svg>
            </button>
            <span class="project-name" title={appStore.rootPath() ?? ""}>{projectName(appStore.rootPath())}</span>
          </div>
          <div class="project-actions">
            <button
              class="project-action-btn follow-btn"
              classList={{ "follow-active": appStore.followTerminal() }}
              onClick={() => appStore.setFollowTerminal(!appStore.followTerminal())}
              title={appStore.followTerminal() ? "Follow terminal project: on" : "Follow terminal project: off"}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25Zm1.75-.25a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25ZM7.25 8a.749.749 0 0 1-.22.53l-2.25 2.25a.749.749 0 1 1-1.06-1.06L5.44 8 3.72 6.28a.749.749 0 1 1 1.06-1.06l2.25 2.25c.141.14.22.331.22.53Zm1.5 1.5h3a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1 0-1.5Z"/>
              </svg>
            </button>
            <Show when={appStore.isGitRepo()}>
              <button class="project-action-btn" classList={{ active: appStore.activeTabId() === "git-diff-working" }} onClick={props.onOpenWorkingChanges} title="Working Changes">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/>
                </svg>
              </button>
              <button class="project-action-btn" classList={{ active: appStore.activeTabId() === "git-log" }} onClick={props.onOpenGitLog} title="Commit History">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M1.643 3.143.427 1.927A.25.25 0 0 1 .6 1.5h3.8a.25.25 0 0 1 .177.427l-1.216 1.216a.25.25 0 0 1-.354 0ZM3.75 2.5a.75.75 0 0 1 .75.75v5.94l1.72-1.72a.749.749 0 1 1 1.06 1.06l-3 3a.749.749 0 0 1-1.06 0l-3-3a.749.749 0 1 1 1.06-1.06l1.72 1.72V3.25a.75.75 0 0 1 .75-.75ZM8.25 13h6a.75.75 0 0 1 0 1.5h-6a.75.75 0 0 1 0-1.5ZM8.25 9h6a.75.75 0 0 1 0 1.5h-6a.75.75 0 0 1 0-1.5ZM8.25 5h6a.75.75 0 0 1 0 1.5h-6a.75.75 0 0 1 0-1.5ZM8.25 1h6a.75.75 0 0 1 0 1.5h-6a.75.75 0 0 1 0-1.5Z"/>
                </svg>
              </button>
            </Show>
          </div>
        </div>
        <Show when={dropdownOpen()}>
          <div class="project-dropdown">
            <div class="project-dropdown-item open-folder" onClick={handleOpenFolder}>
              Open Folder...
            </div>
            <Show when={hasRecent()}>
              <div class="project-dropdown-divider" />
              <div class="project-dropdown-label">Recent</div>
              <div class="project-dropdown-search">
                <input
                  ref={projectSearchRef}
                  type="text"
                  class="project-dropdown-search-input"
                  placeholder="Filter by name, path or pinyin..."
                  value={projectQuery()}
                  onInput={(e) => setProjectQuery(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const first = recentProjects()[0];
                      if (first) {
                        e.preventDefault();
                        handleSwitchProject(first.path);
                      }
                    }
                  }}
                />
                <Show when={projectQuery()}>
                  <button
                    class="project-dropdown-search-clear"
                    onClick={(e) => { e.stopPropagation(); setProjectQuery(""); }}
                    title="Clear"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.749.749 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.749.749 0 1 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z"/>
                    </svg>
                  </button>
                </Show>
              </div>
              <Show when={recentProjects().length > 0} fallback={
                <div class="project-dropdown-empty">No matches</div>
              }>
                <For each={recentProjects()}>
                  {(project) => (
                    <div
                      class="project-dropdown-item"
                      onClick={() => handleSwitchProject(project.path)}
                    >
                      <span class="project-item-name" title={project.name}>{project.name}</span>
                      <span class="project-item-path" title={project.path}>{project.path}</span>
                    </div>
                  )}
                </For>
              </Show>
            </Show>
          </div>
        </Show>
      </div>

      <div class="sidebar-search-wrap">
        <input
          type="text"
          class="sidebar-search"
          placeholder="Search files..."
          value={searchQuery()}
          onInput={(e) => onSearchInput(e.currentTarget.value)}
        />
        <Show when={searchQuery()}>
          <button class="sidebar-search-clear" onClick={() => onSearchInput("")}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.749.749 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.749.749 0 1 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z"/>
            </svg>
          </button>
        </Show>
      </div>

      <div class="sidebar-tree">
        <Show when={isSearching()} fallback={
          <For each={entries()}>
            {(entry) => <FileTreeItem entry={entry} depth={0} eventBatch={eventBatch()} />}
          </For>
        }>
          <Show when={searching()}>
            <div class="search-status">Searching...</div>
          </Show>
          <Show when={!searching() && searchResults().length === 0 && isSearching()}>
            <div class="search-status">No results</div>
          </Show>
          <For each={searchResults()}>
            {(entry) => (
              <div class="search-result-row" onClick={() => openSearchResult(entry)}>
                <span class="tree-icon">📄</span>
                <div class="search-result-text">
                  <span class={`search-result-name ${getFileColorClass(entry.name)}`} classList={{ "file-hidden": entry.name.startsWith(".") }} title={entry.name}>{entry.name}</span>
                  <span class="search-result-path" title={relativePath(entry.path, appStore.rootPath() ?? "")}>
                    {relativePath(entry.path, appStore.rootPath() ?? "")}
                  </span>
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>

    </div>
  );
};

export default Sidebar;
