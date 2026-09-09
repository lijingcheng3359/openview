import { Component, Show, Switch, Match, For, onMount, onCleanup, createEffect, lazy } from "solid-js";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import Sidebar from "./components/Sidebar/Sidebar";
import MarkdownPreview from "./components/MarkdownPreview/MarkdownPreview";
import CsvViewer from "./components/CsvViewer/CsvViewer";
import MermaidViewer from "./components/MermaidViewer/MermaidViewer";
import GitLog from "./components/GitLog/GitLog";
import GitDiff from "./components/GitDiff/GitDiff";
import JsonViewer from "./components/JsonViewer/JsonViewer";
import SqliteViewer from "./components/SqliteViewer/SqliteViewer";
import CodeViewer from "./components/CodeViewer/CodeViewer";
import HtmlViewer from "./components/HtmlViewer/HtmlViewer";
import { appStore, addRecentProject, getRecentProjects } from "./stores/app";
import {
  isActiveFileAffected,
  payloadBelongsToRoot,
  type FsChangedPayload,
} from "./fsEvents";
import "diff2html/bundles/css/diff2html.min.css";

const DrawioViewer = lazy(() => import("./components/DrawioViewer/DrawioViewer"));

const SKIP_RELOAD_MODES = new Set(["git-log", "git-diff", "image", "sqlite"]);

const App: Component = () => {
  let unlistenFs: (() => void) | undefined;
  let unlistenFollow: (() => void) | undefined;
  let disposed = false;
  let fileReloadGeneration = 0;
  let projectSwitchGeneration = 0;

  onMount(() => {
    void listen<FsChangedPayload>("fs-changed", async (event) => {
      const root = appStore.rootPath();
      const active = appStore.activeTab();
      if (
        !root
        || !payloadBelongsToRoot(event.payload, root)
        || !active
        || SKIP_RELOAD_MODES.has(active.mode)
        || !isActiveFileAffected(active.path, event.payload)
      ) return;

      const generation = ++fileReloadGeneration;
      const activeId = active.id;
      const activePath = active.path;
      try {
        const content = await invoke<string>("read_file", { path: activePath });
        const current = appStore.activeTab();
        if (
          disposed
          || generation !== fileReloadGeneration
          || appStore.rootPath() !== root
          || current?.id !== activeId
          || current.path !== activePath
        ) return;
        if (content !== current.content) {
          appStore.updateTabContent(activeId, content);
        }
      } catch {}
    }).then((unlisten) => {
      if (disposed) unlisten();
      else unlistenFs = unlisten;
    }).catch(() => {});

    invoke("watch_terminal_project").catch(() => {});
    void listen<string>("terminal-project-changed", (event) => {
      if (!appStore.followTerminal()) return;
      const path = event.payload;
      if (path && path !== appStore.rootPath()) {
        switchToProject(path);
      }
    }).then((unlisten) => {
      if (disposed) unlisten();
      else unlistenFollow = unlisten;
    }).catch(() => {});
  });

  // When follow is turned on, jump to the terminal's current project right away.
  createEffect(() => {
    if (!appStore.followTerminal()) return;
    invoke<string | null>("get_terminal_project")
      .then((path) => {
        if (path && path !== appStore.rootPath()) {
          switchToProject(path);
        }
      })
      .catch(() => {});
  });

  onCleanup(() => {
    disposed = true;
    fileReloadGeneration++;
    projectSwitchGeneration++;
    unlistenFs?.();
    unlistenFollow?.();
  });

  async function openFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      await switchToProject(selected as string);
    }
  }

  async function switchToProject(path: string) {
    const generation = ++projectSwitchGeneration;
    appStore.setRootPath(path);
    appStore.setTabs([]);
    appStore.setActiveTabId(null);
    appStore.setIsGitRepo(false);
    addRecentProject(path);
    try {
      const isGit = await invoke<boolean>("git_detect", { path });
      if (
        disposed
        || generation !== projectSwitchGeneration
        || appStore.rootPath() !== path
      ) return;
      appStore.setIsGitRepo(isGit);
      if (isGit) {
        const id = "git-diff-working";
        appStore.setTabs([
          { id, name: "Working Changes", path: "git://working", mode: "git-diff", content: "working" },
        ]);
        appStore.setActiveTabId(id);
      }
    } catch {}
  }

  function openGitLog() {
    const existing = appStore.tabs().find((t) => t.id === "git-log");
    if (!existing) {
      appStore.setTabs((prev) => [
        ...prev,
        { id: "git-log", name: "Git Log", path: "git://log", mode: "git-log", content: "" },
      ]);
    }
    appStore.setActiveTabId("git-log");
  }

  function openWorkingChanges() {
    const id = "git-diff-working";
    const existing = appStore.tabs().find((t) => t.id === id);
    if (!existing) {
      appStore.setTabs((prev) => [
        ...prev,
        { id, name: "Working Changes", path: "git://working", mode: "git-diff", content: "working" },
      ]);
    }
    appStore.setActiveTabId(id);
  }

  const tab = () => appStore.activeTab();

  return (
    <div class="app">
      <Show when={appStore.rootPath()} fallback={
        <div class="welcome-screen" data-tauri-drag-region>
          <div class="welcome-content">
            <h2 class="welcome-title">OpenView</h2>
            <p class="welcome-subtitle">Open a folder to get started</p>
            <button class="welcome-btn" onClick={openFolder}>Open Folder</button>
            <Show when={getRecentProjects().length > 0}>
              <div class="welcome-recent">
                <p class="welcome-recent-label">Recent Projects</p>
                <For each={getRecentProjects()}>
                  {(project) => (
                    <div class="welcome-recent-item" onClick={() => switchToProject(project.path)}>
                      <span class="welcome-recent-name">{project.name}</span>
                      <span class="welcome-recent-path">{project.path}</span>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      }>
        <Sidebar
          onOpenGitLog={openGitLog}
          onOpenWorkingChanges={openWorkingChanges}
          onOpenFolder={openFolder}
          onSwitchProject={switchToProject}
        />
        <div class="main-content">
          <Show when={tab()} fallback={
            <div class="empty-state" data-tauri-drag-region>Select a file to view</div>
          }>
            <Show when={tab()?.mode !== "git-diff" && tab()?.mode !== "git-log"}>
              <div class="content-header" data-tauri-drag-region>
                <span class="content-filename">{tab()!.name}</span>
                <Show when={tab()?.mode === "html"}>
                  <button
                    class="header-action-btn"
                    onClick={() => invoke("open_in_browser", { path: tab()!.path }).catch(console.error)}
                  >
                    Open in Browser
                  </button>
                </Show>
              </div>
            </Show>
            <div class="content-area">
              <Switch>
                <Match when={tab()?.mode === "markdown"}>
                  <MarkdownPreview content={tab()!.content ?? ""} tabId={tab()!.id} filePath={tab()!.path} />
                </Match>
                <Match when={tab()?.mode === "csv"}>
                  <CsvViewer path={tab()!.path} />
                </Match>
                <Match when={tab()?.mode === "mermaid"}>
                  <MermaidViewer content={tab()!.content ?? ""} tabId={tab()!.id} />
                </Match>
                <Match when={tab()?.mode === "drawio"}>
                  <DrawioViewer content={tab()!.content ?? ""} />
                </Match>
                <Match when={tab()?.mode === "json"}>
                  <JsonViewer content={tab()!.content ?? ""} />
                </Match>
                <Match when={tab()?.mode === "git-log"}>
                  <GitLog />
                </Match>
                <Match when={tab()?.mode === "git-diff"}>
                  <GitDiff commitHash={tab()!.content ?? ""} />
                </Match>
                <Match when={tab()?.mode === "image"}>
                  <div class="image-viewer">
                    <img src={convertFileSrc(tab()!.path)} alt={tab()!.name} />
                  </div>
                </Match>
                <Match when={tab()?.mode === "sqlite"}>
                  <SqliteViewer path={tab()!.path} />
                </Match>
                <Match when={tab()?.mode === "code"}>
                  <CodeViewer content={tab()!.content ?? ""} filename={tab()!.name} />
                </Match>
                <Match when={tab()?.mode === "html"}>
                  <HtmlViewer path={tab()!.path} content={tab()!.content ?? ""} />
                </Match>
                <Match when={tab()?.mode === "plaintext"}>
                  <div class="plaintext-viewer">
                    <pre style={{ padding: "16px", "white-space": "pre-wrap", "word-break": "break-all" }}>{tab()!.content}</pre>
                  </div>
                </Match>
              </Switch>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default App;
