import { Component, createSignal, createEffect, onMount, onCleanup } from "solid-js";
import mermaid from "mermaid";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { appStore } from "../../stores/app";
import "./MermaidViewer.css";

mermaid.initialize({ startOnLoad: false, theme: "default" });

const MermaidViewer: Component<{ content: string; tabId: string }> = (props) => {
  let editorRef: HTMLDivElement | undefined;
  let diagramRef: HTMLDivElement | undefined;
  let view: EditorView | undefined;
  let debounceTimer: number | undefined;
  let renderCount = 0;

  const [error, setError] = createSignal<string | null>(null);
  const [scale, setScale] = createSignal(1);
  const [panX, setPanX] = createSignal(0);
  const [panY, setPanY] = createSignal(0);

  async function renderDiagram(source: string) {
    if (!diagramRef || !source.trim()) return;
    try {
      const id = `mermaid-${++renderCount}`;
      const { svg } = await mermaid.render(id, source);
      diagramRef.innerHTML = svg;
      setError(null);
    } catch (e: any) {
      setError(e.message || "Invalid Mermaid syntax");
    }
  }

  onMount(() => {
    renderDiagram(props.content);

    const state = EditorState.create({
      doc: props.content,
      extensions: [
        basicSetup,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const content = update.state.doc.toString();
            appStore.updateTabContent(props.tabId, content);
            clearTimeout(debounceTimer);
            debounceTimer = window.setTimeout(() => renderDiagram(content), 150);
          }
        }),
        EditorView.theme({
          "&": { height: "100%", background: "var(--bg-editor)" },
          ".cm-scroller": { overflow: "auto" },
          ".cm-content": { fontFamily: "SF Mono, Menlo, monospace", fontSize: "13px" },
        }),
      ],
    });

    view = new EditorView({ state, parent: editorRef! });
  });

  onCleanup(() => {
    view?.destroy();
    clearTimeout(debounceTimer);
  });

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.max(0.1, Math.min(5, s * delta)));
  }

  let isPanning = false;
  let lastX = 0;
  let lastY = 0;

  function handleMouseDown(e: MouseEvent) {
    isPanning = true;
    lastX = e.clientX;
    lastY = e.clientY;
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isPanning) return;
    setPanX((x) => x + e.clientX - lastX);
    setPanY((y) => y + e.clientY - lastY);
    lastX = e.clientX;
    lastY = e.clientY;
  }

  function handleMouseUp() {
    isPanning = false;
  }

  return (
    <div class="mermaid-editor">
      <div class="editor-pane" ref={editorRef} />
      <div
        class="diagram-pane"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {error() && <div class="mermaid-error">{error()}</div>}
        <div
          class="diagram-container"
          ref={diagramRef}
          style={{
            transform: `translate(${panX()}px, ${panY()}px) scale(${scale()})`,
            "transform-origin": "center center",
          }}
        />
      </div>
    </div>
  );
};

export default MermaidViewer;
