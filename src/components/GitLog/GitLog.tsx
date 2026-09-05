import { Component, createSignal, createMemo, createEffect, For, Show, onCleanup, untrack } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { appStore } from "../../stores/app";
import {
  hasGitHistoryMetadataChange,
  payloadBelongsToRoot,
  type FsChangedPayload,
} from "../../fsEvents";
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
  let loadMoreForRoot: (() => Promise<void>) | undefined;
  let reloadBranchForRoot: ((name: string) => Promise<void>) | undefined;

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

  createEffect(() => {
    const root = appStore.rootPath();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let debounceStartedAt: number | undefined;
    let refreshInFlight = false;
    let refreshQueued = false;
    let requestGeneration = 0;

    offset = 0;
    setCommits([]);
    setBranches([]);
    setBranch("");
    setHasMore(true);
    setLoading(false);
    if (!root) return;

    const isCurrent = (generation: number) => (
      !disposed
      && generation === requestGeneration
      && appStore.rootPath() === root
    );

    const refresh = async () => {
      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }
      refreshInFlight = true;
      const generation = ++requestGeneration;
      const preferredBranch = untrack(branch);
      setLoading(true);
      try {
        const [list, currentBranch] = await Promise.all([
          invoke<string[]>("git_branches", { path: root }),
          invoke<string>("git_branch", { path: root }),
        ]);
        if (!isCurrent(generation)) return;
        const nextBranch = list.includes(preferredBranch)
          ? preferredBranch
          : list.includes(currentBranch)
            ? currentBranch
            : list[0] ?? "";
        const batch = await invoke<GitCommit[]>("git_log", {
          path: root,
          offset: 0,
          limit: 50,
          branch: nextBranch || null,
        });
        if (!isCurrent(generation)) return;
        setBranches(list);
        setBranch(nextBranch);
        setCommits(batch);
        offset = batch.length;
        setHasMore(batch.length === 50);
      } catch {
      } finally {
        if (isCurrent(generation)) setLoading(false);
        refreshInFlight = false;
        if (refreshQueued && !disposed) {
          refreshQueued = false;
          void refresh();
        }
      }
    };

    const reloadBranch = async (name: string) => {
      const generation = ++requestGeneration;
      offset = 0;
      setCommits([]);
      setHasMore(true);
      setLoading(true);
      try {
        const batch = await invoke<GitCommit[]>("git_log", {
          path: root,
          offset: 0,
          limit: 50,
          branch: name || null,
        });
        if (!isCurrent(generation) || branch() !== name) return;
        setCommits(batch);
        offset = batch.length;
        setHasMore(batch.length === 50);
      } catch {
      } finally {
        if (isCurrent(generation)) setLoading(false);
      }
    };

    const loadMore = async () => {
      if (loading() || !hasMore()) return;
      const selectedBranch = branch();
      const startOffset = offset;
      const generation = ++requestGeneration;
      setLoading(true);
      try {
        const batch = await invoke<GitCommit[]>("git_log", {
          path: root,
          offset: startOffset,
          limit: 50,
          branch: selectedBranch || null,
        });
        if (!isCurrent(generation) || branch() !== selectedBranch || offset !== startOffset) return;
        setCommits((current) => [...current, ...batch]);
        offset += batch.length;
        setHasMore(batch.length === 50);
      } catch {
      } finally {
        if (isCurrent(generation)) setLoading(false);
      }
    };

    loadMoreForRoot = loadMore;
    reloadBranchForRoot = reloadBranch;

    void listen<FsChangedPayload>("fs-changed", (event) => {
      if (
        disposed
        || !payloadBelongsToRoot(event.payload, root)
        || !hasGitHistoryMetadataChange(event.payload, root)
      ) return;
      const now = Date.now();
      debounceStartedAt ??= now;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        debounceStartedAt = undefined;
        void refresh();
      }, Math.min(250, Math.max(0, 1000 - (now - debounceStartedAt))));
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    }).catch(() => {});

    void refresh();

    onCleanup(() => {
      disposed = true;
      requestGeneration++;
      refreshQueued = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      unlisten?.();
      if (loadMoreForRoot === loadMore) loadMoreForRoot = undefined;
      if (reloadBranchForRoot === reloadBranch) reloadBranchForRoot = undefined;
    });
  });

  async function loadMore() {
    await loadMoreForRoot?.();
  }

  async function onBranchChange(e: Event) {
    const name = (e.target as HTMLSelectElement).value;
    setBranch(name);
    setSelectedHash(null);
    await reloadBranchForRoot?.(name);
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
        <span class="col-commit">Commit</span>
        <span class="col-author">Author</span>
        <span class="col-date">Date</span>
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
                <span class="col-commit">{commit().short_hash}</span>
                <span class="col-author">{commit().author}</span>
                <span class="col-date">{formatDate(commit().date)}</span>
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
