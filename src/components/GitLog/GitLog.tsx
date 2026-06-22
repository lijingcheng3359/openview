import { Component, createSignal, createMemo, For, Show, onMount, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { appStore } from "../../stores/app";
import { buildGraph } from "./graph";
import "./GitLog.css";

interface GitCommit {
  hash: string;
  short_hash: string;
  author: string;
  email: string;
  date: number;
  message: string;
  refs: string[];
  parents: string[];
}

const ROW_H = 32; // px, must match .commit-row total height
const LANE_W = 26; // px per lane column — wider so parallel branches read as distinct columns
const DOT_R = 5; // commit dot radius
const LINE_W = 2.5; // graph line stroke width

const GitLog: Component = () => {
  const [commits, setCommits] = createSignal<GitCommit[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [hasMore, setHasMore] = createSignal(true);
  const [selectedHash, setSelectedHash] = createSignal<string | null>(null);
  const [branches, setBranches] = createSignal<string[]>([]);
  const [branch, setBranch] = createSignal<string>("");
  const [filter, setFilter] = createSignal("");
  const graphRows = createMemo(() => buildGraph(commits()));
  let offset = 0;

  let unlisten: (() => void) | undefined;

  const visibleIndices = createMemo(() => {
    const q = filter().trim().toLowerCase();
    const list = commits();
    const out: number[] = [];
    for (let i = 0; i < list.length; i++) {
      if (!q) {
        out.push(i);
        continue;
      }
      const c = list[i];
      if (
        c.message.toLowerCase().includes(q) ||
        c.author.toLowerCase().includes(q) ||
        c.short_hash.toLowerCase().includes(q)
      ) {
        out.push(i);
      }
    }
    return out;
  });

  async function loadBranches() {
    const path = appStore.rootPath();
    if (!path) return;
    try {
      const [list, current] = await Promise.all([
        invoke<string[]>("git_branches", { path }),
        invoke<string>("git_branch", { path }),
      ]);
      setBranches(list);
      setBranch(list.includes(current) ? current : list[0] ?? "");
    } catch {
      setBranches([]);
    }
  }

  async function reload() {
    const path = appStore.rootPath();
    if (!path) return;
    offset = 0;
    setCommits([]);
    setHasMore(true);
    setLoading(true);
    const batch = await invoke<GitCommit[]>("git_log", {
      path,
      offset,
      limit: 50,
      branch: branch() || null,
    });
    setCommits(batch);
    offset = batch.length;
    setHasMore(batch.length === 50);
    setLoading(false);
  }

  onMount(async () => {
    await loadBranches();
    await reload();
    listen("fs-changed", async () => {
      await loadBranches();
      await reload();
    }).then((fn) => (unlisten = fn));
  });

  onCleanup(() => unlisten?.());

  async function loadMore() {
    const path = appStore.rootPath();
    if (!path || loading() || !hasMore()) return;
    setLoading(true);
    const batch = await invoke<GitCommit[]>("git_log", {
      path,
      offset,
      limit: 50,
      branch: branch() || null,
    });
    setCommits((prev) => [...prev, ...batch]);
    offset += batch.length;
    setHasMore(batch.length === 50);
    setLoading(false);
  }

  async function onBranchChange(e: Event) {
    const name = (e.target as HTMLSelectElement).value;
    setBranch(name);
    // Reload the graph scoped to the selected branch's reachable history, so the
    // view matches the web git graph (one branch at a time, not every ref).
    setSelectedHash(null);
    await reload();
  }

  function laneX(lane: number): number {
    return lane * LANE_W + LANE_W / 2;
  }

  function linePath(fromLane: number, toLane: number, half: "top" | "bottom" | "full"): string {
    const x1 = laneX(fromLane);
    const x2 = laneX(toLane);
    const mid = ROW_H / 2;
    const y1 = half === "bottom" ? mid : 0;
    const y2 = half === "top" ? mid : ROW_H;
    // Straight lines, matching the web reference: a same-lane segment is a clean
    // vertical line, a lane change is a single straight diagonal. No Bezier — the
    // S-curves made two nearby diagonals bow toward each other and read as merged.
    return `M ${x1} ${y1} L ${x2} ${y2}`;
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
      name: `Diff: ${hash.slice(0, 8)}`,
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
        <label class="log-branch">
          <span class="log-branch-label">Branches:</span>
          <select class="log-branch-select" value={branch()} onChange={onBranchChange}>
            <For each={branches()}>{(b) => <option value={b}>{b}</option>}</For>
          </select>
        </label>
        <input
          class="log-find"
          type="text"
          placeholder="Find by message, author, hash…"
          value={filter()}
          onInput={(e) => setFilter(e.currentTarget.value)}
        />
        <span class="log-info">{commits().length} commits</span>
      </div>

      <div class="log-head">
        <span class="col-graph">Graph</span>
        <span class="col-desc">Description</span>
        <span class="col-date">Date</span>
        <span class="col-author">Author</span>
        <span class="col-commit">Commit</span>
      </div>

      <div class="log-list">
        <For each={visibleIndices()}>
          {(idx) => {
            const commit = () => commits()[idx];
            const row = () => graphRows()[idx];
            return (
              <div
                class="commit-row"
                classList={{ selected: commit().hash === selectedHash() }}
                onClick={() => selectCommit(commit().hash)}
              >
                <span class="col-graph">
                  <Show when={row()}>
                    <svg
                      class="commit-graph"
                      width={Math.max(row().laneCount, 1) * LANE_W}
                      height={ROW_H}
                    >
                      <For each={row().lines}>
                        {(line) => (
                          <path
                            d={linePath(line.fromLane, line.toLane, line.half)}
                            stroke={line.color}
                            stroke-width={LINE_W}
                            fill="none"
                            stroke-linecap="round"
                          />
                        )}
                      </For>
                      <circle
                        cx={laneX(row().commitLane)}
                        cy={ROW_H / 2}
                        r={DOT_R}
                        fill={row().color}
                        stroke="var(--bg)"
                        stroke-width="1.5"
                      />
                    </svg>
                  </Show>
                </span>
                <span class="col-desc">
                  <Show when={commit().refs.length > 0}>
                    <For each={commit().refs}>
                      {(ref) => <span class="commit-ref">{ref}</span>}
                    </For>
                  </Show>
                  <span class="commit-message">{commit().message.split("\n")[0]}</span>
                </span>
                <span class="col-date">{formatDate(commit().date)}</span>
                <span class="col-author">{commit().author}</span>
                <span class="col-commit">{commit().short_hash}</span>
              </div>
            );
          }}
        </For>

        <Show when={loading()}>
          <div class="commit-loading">Loading…</div>
        </Show>

        <Show when={!loading() && hasMore() && !filter().trim()}>
          <button class="log-load-more" onClick={loadMore}>
            Load More Commits
          </button>
        </Show>
      </div>
    </div>
  );
};

export default GitLog;
