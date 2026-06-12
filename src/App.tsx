import { Component, Show, Switch, Match, For, onMount } from "solid-js";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import Sidebar from "./components/Sidebar/Sidebar";
import MarkdownPreview from "./components/MarkdownPreview/MarkdownPreview";
import CsvViewer from "./components/CsvViewer/CsvViewer";
import MermaidViewer from "./components/MermaidViewer/MermaidViewer";
import GitLog from "./components/GitLog/GitLog";
import GitDiff from "./components/GitDiff/GitDiff";
import JsonViewer from "./components/JsonViewer/JsonViewer";
import SqliteViewer from "./components/SqliteViewer/SqliteViewer";
import { appStore, addRecentProject, getRecentProjects } from "./stores/app";
import "diff2html/bundles/css/diff2html.min.css";

const App: Component = () => {
  onMount(async () => {});

  async function openFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      await switchToProject(selected as string);
    }
  }

  async function switchToProject(path: string) {
    appStore.setRootPath(path);
    appStore.setTabs([]);
    appStore.setActiveTabId(null);
    addRecentProject(path);
    const isGit = await invoke<boolean>("git_detect", { path });
    appStore.setIsGitRepo(isGit);
  }

  function openGitLog() {
    appStore.setTabs([
      { id: "git-log", name: "Git Log", path: "git://log", mode: "git-log", content: "" },
    ]);
    appStore.setActiveTabId("git-log");
  }

  function openWorkingChanges() {
    const id = "git-diff-working";
    appStore.setTabs([
      { id, name: "Working Changes", path: "git://working", mode: "git-diff", content: "working" },
    ]);
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
              </div>
            </Show>
            <div class="content-area">
              <Switch>
                <Match when={tab()?.mode === "markdown"}>
                  <MarkdownPreview content={tab()!.content ?? ""} tabId={tab()!.id} />
                </Match>
                <Match when={tab()?.mode === "csv"}>
                  <CsvViewer path={tab()!.path} />
                </Match>
                <Match when={tab()?.mode === "mermaid"}>
                  <MermaidViewer content={tab()!.content ?? ""} tabId={tab()!.id} />
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
