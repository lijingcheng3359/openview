import { Component, createSignal, createEffect, onMount, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { EditorView, basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorState } from "@codemirror/state";
import { appStore } from "../../stores/app";
import "./MarkdownPreview.css";

const MarkdownPreview: Component<{ content: string; tabId: string }> = (props) => {
  let editorRef: HTMLDivElement | undefined;
  let previewRef: HTMLDivElement | undefined;
  let view: EditorView | undefined;
  let debounceTimer: number | undefined;

  const [html, setHtml] = createSignal("");

  async function updatePreview(content: string) {
    const result = await invoke<string>("parse_markdown", { content });
    setHtml(result);
  }

  onMount(() => {
    updatePreview(props.content);

    const state = EditorState.create({
      doc: props.content,
      extensions: [
        basicSetup,
        markdown({ codeLanguages: languages }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const content = update.state.doc.toString();
            appStore.updateTabContent(props.tabId, content);
            clearTimeout(debounceTimer);
            debounceTimer = window.setTimeout(() => updatePreview(content), 150);
          }
        }),
        EditorView.theme({
          "&": { height: "100%", background: "var(--bg-editor)" },
          ".cm-scroller": { overflow: "auto" },
          ".cm-content": { fontFamily: "SF Mono, Menlo, monospace", fontSize: "13px" },
        }),
      ],
    });

    view = new EditorView({
      state,
      parent: editorRef!,
    });
  });

  onCleanup(() => {
    view?.destroy();
    clearTimeout(debounceTimer);
  });

  const [hoverSide, setHoverSide] = createSignal<"left" | "right" | null>(null);
  let containerRef: HTMLDivElement | undefined;

  function handleMouseMove(e: MouseEvent) {
    if (!containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    if (ratio < 0.05) setHoverSide("left");
    else if (ratio > 0.95) setHoverSide("right");
  }

  return (
    <div
      class="markdown-editor"
      ref={containerRef}
      classList={{
        "hover-left": hoverSide() === "left",
        "hover-right": hoverSide() === "right",
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverSide(null)}
    >
      <div class="preview-pane" ref={previewRef}>
        <div class="markdown-body" innerHTML={html()} />
      </div>
      <div class="editor-pane" ref={editorRef} />
    </div>
  );
};

export default MarkdownPreview;
