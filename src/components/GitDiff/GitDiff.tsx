import { Component, createSignal, createEffect, onCleanup, Show, For, untrack } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { html as diffHtml } from "diff2html";
import { appStore } from "../../stores/app";
import {
  hasGitHistoryMetadataChange,
  hasWorkingTreeChange,
  payloadBelongsToRoot,
  type FsChangedPayload,
} from "../../fsEvents";
import "./GitDiff.css";

interface GitDiffFile {
  path: string;
  status: string;
  patch: string | null;
}

interface GitDiffResult {
  files: GitDiffFile[];
}

function statusLabel(s: string): { letter: string; cls: string } {
  switch (s) {
    case "added": return { letter: "A", cls: "status-added" };
    case "deleted": return { letter: "D", cls: "status-deleted" };
    case "renamed": return { letter: "R", cls: "status-renamed" };
    case "untracked": return { letter: "U", cls: "status-untracked" };
    default: return { letter: "M", cls: "status-modified" };
  }
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

function fileDir(path: string): string {
  const parts = path.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}

const GitDiff: Component<{ commitHash: string }> = (props) => {
  const [diffResult, setDiffResult] = createSignal<GitDiffResult | null>(null);
  const [viewMode, setViewMode] = createSignal<"unified" | "side-by-side">("unified");
  const [renderedHtml, setRenderedHtml] = createSignal("");
  const [selectedIdx, setSelectedIdx] = createSignal(0);
  const [branch, setBranch] = createSignal("");

  createEffect(() => {
    const root = appStore.rootPath();
    const commitHash = props.commitHash;
    const working = commitHash === "working";
    let disposed = false;
    let unlisten: (() => void) | undefined;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let debounceStartedAt: number | undefined;
    let debounceBranchRefresh = false;
    let inFlight = false;
    let queued = false;
    let queuedBranchRefresh = false;

    setDiffResult(null);
    setBranch("");
    if (!root) return;

    const load = async (refreshBranch: boolean) => {
      if (inFlight) {
        queued = true;
        queuedBranchRefresh ||= refreshBranch;
        return;
      }
      inFlight = true;
      try {
        const diffPromise = invoke<GitDiffResult>("git_diff", {
          path: root,
          commitHash: working ? undefined : commitHash,
        });
        const branchPromise = working && refreshBranch
          ? invoke<string>("git_branch", { path: root })
          : Promise.resolve<string | null>(null);
        const [result, currentBranch] = await Promise.all([diffPromise, branchPromise]);
        if (disposed || appStore.rootPath() !== root || props.commitHash !== commitHash) return;
        const selectedPath = untrack(() => diffResult()?.files[selectedIdx()]?.path);
        const nextIndex = selectedPath
          ? result.files.findIndex((file) => file.path === selectedPath)
          : -1;
        setSelectedIdx(nextIndex >= 0 ? nextIndex : 0);
        setDiffResult(result);
        if (currentBranch !== null) setBranch(currentBranch);
      } catch {
      } finally {
        inFlight = false;
        if (queued && !disposed) {
          const refreshQueuedBranch = queuedBranchRefresh;
          queued = false;
          queuedBranchRefresh = false;
          void load(refreshQueuedBranch);
        }
      }
    };

    if (working) {
      void listen<FsChangedPayload>("fs-changed", (event) => {
        if (
          disposed
          || !payloadBelongsToRoot(event.payload, root)
          || !hasWorkingTreeChange(event.payload, root)
        ) return;
        debounceBranchRefresh ||= hasGitHistoryMetadataChange(event.payload, root);
        const now = Date.now();
        debounceStartedAt ??= now;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const refreshBranch = debounceBranchRefresh;
          debounceTimer = undefined;
          debounceStartedAt = undefined;
          debounceBranchRefresh = false;
          void load(refreshBranch);
        }, Math.min(250, Math.max(0, 1000 - (now - debounceStartedAt))));
      }).then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      }).catch(() => {});
    }

    void load(working);

    onCleanup(() => {
      disposed = true;
      queued = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      unlisten?.();
    });
  });

  createEffect(() => {
    const result = diffResult();
    const idx = selectedIdx();
    const mode = viewMode();
    const root = appStore.rootPath();
    let disposed = false;
    onCleanup(() => {
      disposed = true;
    });

    if (!result || result.files.length === 0) {
      setRenderedHtml("");
      return;
    }
    const file = result.files[idx];
    if (!file?.patch) {
      if (file?.status === "untracked" && root) {
        invoke<string>("read_file", { path: `${root}/${file.path}` })
          .then((content) => {
            if (disposed || appStore.rootPath() !== root) return;
            const lines = content.split("\n");
            const numbered = lines.map((line) => `+${line}`).join("\n");
            const fakePatch = `--- /dev/null\n+++ b/${file.path}\n@@ -0,0 +1,${lines.length} @@\n${numbered}`;
            const html = diffHtml(fakePatch, {
              drawFileList: false,
              matching: "lines",
              outputFormat: mode === "unified" ? "line-by-line" : "side-by-side",
            });
            if (!disposed && appStore.rootPath() === root) setRenderedHtml(html);
          })
          .catch(() => {
            if (!disposed && appStore.rootPath() === root) {
              setRenderedHtml("<div class='diff-empty'>Unable to read file</div>");
            }
          });
        return;
      }
      setRenderedHtml("<div class='diff-empty'>No changes</div>");
      return;
    }
    const html = diffHtml(file.patch, {
      drawFileList: false,
      matching: "lines",
      outputFormat: mode === "unified" ? "line-by-line" : "side-by-side",
    });
    setRenderedHtml(html);
  });

  function toggleViewMode() {
    setViewMode((m) => m === "unified" ? "side-by-side" : "unified");
  }

  function selectFile(idx: number) {
    setSelectedIdx(idx);
  }

  return (
    <div class="git-diff">
      <div class="diff-toolbar" data-tauri-drag-region>
        <span class="diff-title">
          {props.commitHash === "working" ? "Working Changes" : `Commit ${props.commitHash.slice(0, 8)}`}
        </span>
        <Show when={props.commitHash === "working" && branch()}>
          <span class="diff-branch">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z"/>
            </svg>
            {branch()}
          </span>
        </Show>
        <button class="diff-toggle" onClick={toggleViewMode}>
          {viewMode() === "unified" ? "Side by Side" : "Unified"}
        </button>
        <Show when={diffResult()}>
          <span class="diff-info">{diffResult()!.files.length} files changed</span>
        </Show>
      </div>
      <div class="diff-body">
        <Show when={diffResult() && diffResult()!.files.length > 0}>
          <div class="diff-file-list">
            <For each={diffResult()!.files}>
              {(file, i) => {
                const st = statusLabel(file.status);
                const dir = fileDir(file.path);
                return (
                  <div
                    class="diff-file-item"
                    classList={{ selected: selectedIdx() === i() }}
                    onClick={() => selectFile(i())}
                  >
                    <span class={`diff-file-status ${st.cls}`}>{st.letter}</span>
                    <div class="diff-file-info">
                      <span class="diff-file-name">{fileName(file.path)}</span>
                      <Show when={dir}>
                        <span class="diff-file-dir">{dir}</span>
                      </Show>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
        <div class="diff-content" innerHTML={renderedHtml()} />
      </div>
    </div>
  );
};

export default GitDiff;
