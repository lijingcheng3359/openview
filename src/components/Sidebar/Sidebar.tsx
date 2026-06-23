import { Component, createSignal, createEffect, For, Show, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { appStore, getRecentProjects, RecentProject } from "../../stores/app";
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

function entriesEqual(a: FileEntry[], b: FileEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].name !== b[i].name || a[i].path !== b[i].path || a[i].is_dir !== b[i].is_dir) return false;
  }
  return true;
}

function getFileColorClass(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext || ext === filename.toLowerCase()) return "";
  return EXT_COLOR_MAP[ext] || "";
}

const FileTreeItem: Component<{ entry: FileEntry; depth: number; refreshKey: number }> = (props) => {
  const [expanded, setExpanded] = createSignal(false);
  const [children, setChildren] = createSignal<FileEntry[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  const [copied, setCopied] = createSignal(false);

  function copyPath(e: MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(props.entry.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  createEffect(() => {
    const _key = props.refreshKey;
    if (loaded() && expanded() && props.entry.is_dir) {
      invoke<FileEntry[]>("read_dir", { path: props.entry.path }).then((newChildren) => {
        if (!entriesEqual(children(), newChildren)) {
          setChildren(newChildren);
        }
      });
    }
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

    if (!loaded()) {
      const entries = await invoke<FileEntry[]>("read_dir", { path: props.entry.path });
      setChildren(entries);
      setLoaded(true);
    }
    setExpanded(!expanded());
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
        <span class="tree-name" classList={{ "file-hidden": props.entry.name.startsWith(".") }}>{props.entry.name}</span>
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
          {(child) => <FileTreeItem entry={child} depth={props.depth + 1} refreshKey={props.refreshKey} />}
        </For>
      </Show>
    </div>
  );
};

function relativePath(fullPath: string, root: string): string {
  if (fullPath.startsWith(root)) {
    const rel = fullPath.slice(root.length);
    return rel.startsWith("/") ? rel.slice(1) : rel;
  }
  return fullPath;
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
  const [refreshKey, setRefreshKey] = createSignal(0);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let dropdownRef: HTMLDivElement | undefined;
  let unlistenFs: UnlistenFn | undefined;

  onCleanup(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    unlistenFs?.();
  });

  function handleClickOutside(e: MouseEvent) {
    if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
      setDropdownOpen(false);
    }
  }

  createEffect(() => {
    if (dropdownOpen()) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }
  });

  onCleanup(() => {
    document.removeEventListener("mousedown", handleClickOutside);
  });

  createEffect(async () => {
    const path = appStore.rootPath();
    if (!path) return;

    invoke<FileEntry[]>("read_dir", { path }).then(setEntries);
    invoke("watch_path", { path });

    unlistenFs?.();
    unlistenFs = await listen<string>("fs-changed", () => {
      setRefreshKey((k) => k + 1);
      invoke<FileEntry[]>("read_dir", { path }).then((newEntries) => {
        if (!entriesEqual(entries(), newEntries)) {
          setEntries(newEntries);
        }
      });
    });
  });

  function onSearchInput(value: string) {
    setSearchQuery(value);
    if (debounceTimer) clearTimeout(debounceTimer);

    if (!value.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceTimer = setTimeout(async () => {
      const root = appStore.rootPath();
      if (!root) return;
      try {
        const results = await invoke<FileEntry[]>("search_files", {
          root,
          query: value.trim(),
        });
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      }
      setSearching(false);
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

  const isSearching = () => searchQuery().trim().length > 0;

  const recentProjects = () => {
    dropdownOpen();
    const current = appStore.rootPath();
    return getRecentProjects().filter((p) => p.path !== current);
  };

  return (
    <div class="sidebar" style={{ width: `${appStore.sidebarWidth()}px` }}>
      <div class="sidebar-brand" data-tauri-drag-region>
        <span class="brand-name">OpenView</span>
      </div>

      <div class="project-switcher" ref={dropdownRef}>
        <div class="project-header">
          <div class="project-current" onClick={() => setDropdownOpen(!dropdownOpen())}>
            <svg class="project-folder-icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1Z"/>
            </svg>
            <span class="project-name">{projectName(appStore.rootPath())}</span>
          </div>
          <Show when={appStore.isGitRepo()}>
            <div class="project-actions">
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
            </div>
          </Show>
        </div>
        <Show when={dropdownOpen()}>
          <div class="project-dropdown">
            <div class="project-dropdown-item open-folder" onClick={handleOpenFolder}>
              Open Folder...
            </div>
            <Show when={recentProjects().length > 0}>
              <div class="project-dropdown-divider" />
              <div class="project-dropdown-label">Recent</div>
              <For each={recentProjects()}>
                {(project) => (
                  <div
                    class="project-dropdown-item"
                    onClick={() => handleSwitchProject(project.path)}
                  >
                    <span class="project-item-name">{project.name}</span>
                    <span class="project-item-path">{project.path}</span>
                  </div>
                )}
              </For>
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
            {(entry) => <FileTreeItem entry={entry} depth={0} refreshKey={refreshKey()} />}
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
                  <span class={`search-result-name ${getFileColorClass(entry.name)}`} classList={{ "file-hidden": entry.name.startsWith(".") }}>{entry.name}</span>
                  <span class="search-result-path">
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
