import { Component, createSignal, createEffect, For, Show, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { appStore, getRecentProjects, RecentProject } from "../../stores/app";
import "./Sidebar.css";

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  extension: string | null;
}

const FileTreeItem: Component<{ entry: FileEntry; depth: number }> = (props) => {
  const [expanded, setExpanded] = createSignal(false);
  const [children, setChildren] = createSignal<FileEntry[]>([]);
  const [loaded, setLoaded] = createSignal(false);

  async function toggle() {
    if (!props.entry.is_dir) {
      const mode = appStore.detectMode(props.entry.name);
      if (mode === "image") {
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
        <Show when={props.entry.is_dir}>
          <span class="tree-arrow" classList={{ expanded: expanded() }}>
            ▶
          </span>
        </Show>
        <Show when={!props.entry.is_dir}>
          <span class="tree-icon">📄</span>
        </Show>
        <span class="tree-name">{props.entry.name}</span>
      </div>
      <Show when={expanded()}>
        <For each={children()}>
          {(child) => <FileTreeItem entry={child} depth={props.depth + 1} />}
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
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let dropdownRef: HTMLDivElement | undefined;

  onCleanup(() => {
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
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }
  });

  onCleanup(() => {
    document.removeEventListener("mousedown", handleClickOutside);
  });

  createEffect(() => {
    const path = appStore.rootPath();
    if (path) {
      invoke<FileEntry[]>("read_dir", { path }).then(setEntries);
    }
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
    if (mode === "image") {
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
        <div class="project-current" onClick={() => setDropdownOpen(!dropdownOpen())}>
          <span class="project-folder-icon">📁</span>
          <span class="project-name">{projectName(appStore.rootPath())}</span>
          <span class="project-chevron">{dropdownOpen() ? "▾" : "▸"}</span>
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
      </div>

      <div class="sidebar-tree">
        <Show when={isSearching()} fallback={
          <For each={entries()}>
            {(entry) => <FileTreeItem entry={entry} depth={0} />}
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
                  <span class="search-result-name">{entry.name}</span>
                  <span class="search-result-path">
                    {relativePath(entry.path, appStore.rootPath() ?? "")}
                  </span>
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>

      <Show when={appStore.isGitRepo()}>
        <div class="sidebar-git">
          <div class="git-row" onClick={props.onOpenWorkingChanges}>
            <span class="git-icon">◇</span>
            <span class="tree-name">Working Changes</span>
          </div>
          <div class="git-row" onClick={props.onOpenGitLog}>
            <span class="git-icon">⏱</span>
            <span class="tree-name">Commit History</span>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default Sidebar;
