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
  let offset = 0;

  let unlisten: (() => void) | undefined;

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
    return new Date(timestamp * 1000).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
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
    <div class="git-log" onScroll={handleScroll}>
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
              <For each={commit.refs}>
                {(ref) => <span class="commit-ref">{ref}</span>}
              </For>
            </div>
            <div class="commit-meta">
              <span class="commit-author">{commit.author}</span>
              <span class="commit-date">{formatDate(commit.date)}</span>
            </div>
          </div>
        )}
      </For>
      <Show when={loading()}>
        <div class="commit-loading">Loading...</div>
      </Show>
    </div>
  );
};

export default GitLog;
