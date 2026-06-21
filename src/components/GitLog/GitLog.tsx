import { Component, createSignal, For, Show, onMount, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { appStore } from "../../stores/app";
import "./GitLog.css";

interface GitCommit {
  hash: string;
  short_hash: string;
  author: string;
  email: string;
  date: number;
  message: string;
  refs: string[];
}

const GitLog: Component = () => {
  const [commits, setCommits] = createSignal<GitCommit[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [selectedHash, setSelectedHash] = createSignal<string | null>(null);
  const [branch, setBranch] = createSignal("");
  let offset = 0;

  let unlisten: (() => void) | undefined;

  async function loadBranch() {
    const path = appStore.rootPath();
    if (!path) return;
    try {
      const b = await invoke<string>("git_branch", { path });
      setBranch(b);
    } catch {}
  }

  async function reload() {
    const path = appStore.rootPath();
    if (!path) return;
    offset = 0;
    setCommits([]);
    setLoading(true);
    const batch = await invoke<GitCommit[]>("git_log", { path, offset, limit: 50 });
    setCommits(batch);
    offset = batch.length;
    setLoading(false);
  }

  onMount(() => {
    loadBranch();
    loadMore();
    listen("fs-changed", reload).then((fn) => unlisten = fn);
  });

  onCleanup(() => unlisten?.());

  async function loadMore() {
    const path = appStore.rootPath();
    if (!path || loading()) return;
    setLoading(true);
    const batch = await invoke<GitCommit[]>("git_log", { path, offset, limit: 50 });
    setCommits((prev) => [...prev, ...batch]);
    offset += batch.length;
    setLoading(false);
  }

  function handleScroll(e: Event) {
    const el = e.target as HTMLDivElement;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
      loadMore();
    }
  }

  function formatDate(timestamp: number): string {
    const d = new Date(timestamp * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function selectCommit(hash: string) {
    setSelectedHash(hash);
    const tab = {
      id: `git-diff-${hash}`,
      name: `Diff: ${hash.slice(0, 7)}`,
      path: `git://${hash}`,
      mode: "git-diff" as const,
      content: hash,
    };
    appStore.setTabs([tab]);
    appStore.setActiveTabId(tab.id);
  }

  return (
    <div class="git-log">
      <div class="log-toolbar" data-tauri-drag-region>
        <span class="log-title">Commit History</span>
        <span class="log-info">{commits().length} commits</span>
      </div>
      <div class="log-list" onScroll={handleScroll}>
      <For each={commits()}>
        {(commit) => (
          <div
            class="commit-row"
            classList={{ selected: commit.hash === selectedHash() }}
            onClick={() => selectCommit(commit.hash)}
          >
            <div class="commit-main">
              <span class="commit-hash">{commit.short_hash}</span>
              <span class="commit-message">{commit.message.split("\n")[0]}</span>
              <span class="commit-meta">
                <span class="commit-author">{commit.author}</span>
                <span class="commit-date">{formatDate(commit.date)}</span>
              </span>
            </div>
            <Show when={commit.refs.length > 0}>
              <div class="commit-refs">
                <For each={commit.refs}>
                  {(ref) => <span class="commit-ref">{ref}</span>}
                </For>
              </div>
            </Show>
          </div>
        )}
      </For>
      <Show when={loading()}>
        <div class="commit-loading">Loading...</div>
      </Show>
      </div>
      <Show when={branch()}>
        <div class="log-statusbar">
          <span class="log-branch">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z"/>
            </svg>
            {branch()}
          </span>
        </div>
      </Show>
    </div>
  );
};

export default GitLog;
