import {
  FitPlugin,
  Graph,
  InternalEvent,
  ModelXmlSerializer,
  PanningHandler,
  PopupMenuHandler,
  TooltipHandler,
} from "@maxgraph/core";
import { Component, For, Show, createEffect, createSignal, onCleanup, onMount, untrack } from "solid-js";
import { DrawioPage, parseDrawioFile } from "./drawio";
import "./DrawioViewer.css";

const DrawioViewer: Component<{ content: string }> = (props) => {
  let canvasRef: HTMLDivElement | undefined;
  let graph: Graph | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let fitFrame: number | undefined;
  let fitMode = true;

  const [pages, setPages] = createSignal<DrawioPage[]>([]);
  const [selectedPageId, setSelectedPageId] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [scale, setScale] = createSignal(100);

  function destroyGraph() {
    if (fitFrame !== undefined) cancelAnimationFrame(fitFrame);
    fitFrame = undefined;
    graph?.destroy();
    graph = undefined;
    canvasRef?.replaceChildren();
  }

  function updateScale() {
    if (graph) setScale(Math.round(graph.getView().scale * 100));
  }

  function fitGraph() {
    if (!graph || !canvasRef?.clientWidth || !canvasRef.clientHeight) return;
    graph.getPlugin<FitPlugin>("fit")?.fitCenter({ margin: 24 });
    updateScale();
  }

  function scheduleFit() {
    if (fitFrame !== undefined) cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(() => {
      fitFrame = requestAnimationFrame(() => {
        fitFrame = undefined;
        fitGraph();
      });
    });
  }

  function renderPage(page: DrawioPage) {
    destroyGraph();
    if (!canvasRef) return;

    try {
      const nextGraph = new Graph(canvasRef);
      graph = nextGraph;
      Object.assign(nextGraph.getStylesheet().getDefaultVertexStyle(), {
        fillColor: "#ffffff",
        strokeColor: "#000000",
        fontColor: "#000000",
      });
      Object.assign(nextGraph.getStylesheet().getDefaultEdgeStyle(), {
        strokeColor: "#000000",
        fontColor: "#000000",
      });
      nextGraph.getStylesheet().putCellStyle("text", {
        shape: "rectangle",
        fillColor: "none",
        strokeColor: "none",
      });
      nextGraph.getStylesheet().putCellStyle("cylinder", { shape: "cylinder" });
      nextGraph.setEnabled(false);
      nextGraph.setCellsSelectable(false);
      nextGraph.setConnectable(false);
      nextGraph.setHtmlLabels(true);
      nextGraph.setPanning(true);
      nextGraph.getView().setAllowEval(false);
      nextGraph.centerZoom = true;
      nextGraph.getPlugin<TooltipHandler>("TooltipHandler")?.setEnabled(false);
      nextGraph.getPlugin<PopupMenuHandler>("PopupMenuHandler")?.setEnabled(false);

      const panning = nextGraph.getPlugin<PanningHandler>("PanningHandler");
      if (panning) {
        panning.useLeftButtonForPanning = true;
        panning.usePopupTrigger = false;
        panning.ignoreCell = true;
      }

      InternalEvent.disableContextMenu(canvasRef);
      new ModelXmlSerializer(nextGraph.getDataModel()).import(page.modelXml);
      nextGraph.refresh();
      fitMode = true;
      setError(null);
      scheduleFit();
    } catch (cause) {
      destroyGraph();
      setError(cause instanceof Error ? cause.message : "Unable to render Draw.io diagram");
    }
  }

  function zoom(direction: "in" | "out") {
    if (!graph) return;
    fitMode = false;
    if (direction === "in") graph.zoomIn();
    else graph.zoomOut();
    updateScale();
  }

  function actualSize() {
    if (!graph) return;
    fitMode = false;
    graph.zoomActual();
    graph.center(true, true);
    updateScale();
  }

  function fit() {
    fitMode = true;
    fitGraph();
  }

  function handleWheel(event: WheelEvent) {
    if (!graph) return;
    event.preventDefault();
    zoom(event.deltaY < 0 ? "in" : "out");
  }

  createEffect(() => {
    const content = props.content;
    try {
      const nextPages = parseDrawioFile(content);
      const currentId = untrack(selectedPageId);
      setPages(nextPages);
      setSelectedPageId(nextPages.some((page) => page.id === currentId) ? currentId : nextPages[0].id);
      setError(null);
    } catch (cause) {
      destroyGraph();
      setPages([]);
      setSelectedPageId("");
      setError(cause instanceof Error ? cause.message : "Unable to open Draw.io file");
    }
  });

  createEffect(() => {
    const selected = pages().find((page) => page.id === selectedPageId());
    if (selected) renderPage(selected);
  });

  onMount(() => {
    if (canvasRef) {
      resizeObserver = new ResizeObserver(() => {
        if (fitMode) scheduleFit();
      });
      resizeObserver.observe(canvasRef);
    }
  });

  onCleanup(() => {
    resizeObserver?.disconnect();
    destroyGraph();
  });

  return (
    <div class="drawio-viewer">
      <div class="drawio-toolbar">
        <Show when={pages().length > 1}>
          <label class="drawio-page-label" for="drawio-page-select">Page</label>
          <select
            id="drawio-page-select"
            class="drawio-page-select"
            value={selectedPageId()}
            onChange={(event) => setSelectedPageId(event.currentTarget.value)}
          >
            <For each={pages()}>{(page) => <option value={page.id}>{page.name}</option>}</For>
          </select>
        </Show>
        <div class="drawio-toolbar-spacer" />
        <button class="drawio-toolbar-btn" type="button" title="Zoom out" onClick={() => zoom("out")}>−</button>
        <button class="drawio-scale" type="button" title="Actual size" onClick={actualSize}>{scale()}%</button>
        <button class="drawio-toolbar-btn" type="button" title="Zoom in" onClick={() => zoom("in")}>+</button>
        <button class="drawio-fit-btn" type="button" onClick={fit}>Fit</button>
      </div>
      <div class="drawio-canvas" ref={canvasRef} onWheel={handleWheel} />
      <Show when={error()}>
        <div class="drawio-error">{error()}</div>
      </Show>
    </div>
  );
};

export default DrawioViewer;
