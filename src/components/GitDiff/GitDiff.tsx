import { Component, createSignal, createEffect, onMount, Show, For } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { html as diffHtml } from "diff2html";
import { appStore } from "../../stores/app";
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

  onMount(async () => {
    const path = appStore.rootPath();
    if (!path) return;

    const hash = props.commitHash === "working" ? undefined : props.commitHash;
    const result = await invoke<GitDiffResult>("git_diff", {
      path,
      commitHash: hash,
    });
    setDiffResult(result);
  });

  createEffect(() => {
    const result = diffResult();
    const idx = selectedIdx();
    const mode = viewMode();
    if (!result || result.files.length === 0) {
      setRenderedHtml("");
      return;
    }
    const file = result.files[idx];
    if (!file?.patch) {
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
      <div class="diff-toolbar">
        <span class="diff-title">
          {props.commitHash === "working" ? "Working Changes" : `Commit ${props.commitHash.slice(0, 7)}`}
        </span>
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
