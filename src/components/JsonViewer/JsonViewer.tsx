import { Component, createSignal, createMemo, Show, For } from "solid-js";
import "./JsonViewer.css";

const DEFAULT_EXPAND_DEPTH = 2;

const JsonNode: Component<{
  value: unknown;
  keyName?: string;
  depth: number;
  expandAll: number;
  last: boolean;
}> = (props) => {
  const isExpandable = () => {
    const v = props.value;
    return v !== null && typeof v === "object";
  };

  const [expanded, setExpanded] = createSignal(props.depth < DEFAULT_EXPAND_DEPTH);

  const toggle = () => setExpanded(!expanded());

  createMemo(() => {
    if (props.expandAll > 0) setExpanded(true);
    if (props.expandAll < 0) setExpanded(false);
  });

  const isArray = () => Array.isArray(props.value);
  const entries = () => {
    const v = props.value;
    if (Array.isArray(v)) return v.map((item, i) => ({ key: String(i), value: item }));
    if (v !== null && typeof v === "object") return Object.entries(v).map(([k, val]) => ({ key: k, value: val }));
    return [];
  };
  const count = () => entries().length;
  const bracket = () => isArray() ? ["[", "]"] : ["{", "}"];
  const comma = () => props.last ? "" : ",";

  function renderPrimitive(value: unknown) {
    if (value === null) return <span class="json-null">null</span>;
    if (typeof value === "boolean") return <span class="json-boolean">{String(value)}</span>;
    if (typeof value === "number") return <span class="json-number">{String(value)}</span>;
    if (typeof value === "string") return <span class="json-string">"{value}"</span>;
    return <span>{String(value)}</span>;
  }

  return (
    <div class="json-node" style={{ "padding-left": `${props.depth > 0 ? 20 : 0}px` }}>
      <Show when={isExpandable()} fallback={
        <div class="json-line">
          <Show when={props.keyName !== undefined}>
            <span class="json-key">"{props.keyName}"</span>
            <span class="json-colon">: </span>
          </Show>
          {renderPrimitive(props.value)}
          <span class="json-comma">{comma()}</span>
        </div>
      }>
        <div class="json-line json-expandable" onClick={toggle}>
          <span class="json-arrow" classList={{ expanded: expanded() }}>▶</span>
          <Show when={props.keyName !== undefined}>
            <span class="json-key">"{props.keyName}"</span>
            <span class="json-colon">: </span>
          </Show>
          <span class="json-bracket">{bracket()[0]}</span>
          <Show when={!expanded()}>
            <span class="json-ellipsis">
              {isArray() ? `...` : `...`}
            </span>
            <span class="json-bracket">{bracket()[1]}</span>
            <span class="json-count">{count()} {isArray() ? (count() === 1 ? "item" : "items") : (count() === 1 ? "key" : "keys")}</span>
            <span class="json-comma">{comma()}</span>
          </Show>
        </div>
        <Show when={expanded()}>
          <For each={entries()}>
            {(entry, i) => (
              <JsonNode
                value={entry.value}
                keyName={isArray() ? undefined : entry.key}
                depth={props.depth + 1}
                expandAll={props.expandAll}
                last={i() === count() - 1}
              />
            )}
          </For>
          <div class="json-line" style={{ "padding-left": `${props.depth > 0 ? 20 : 0}px` }}>
            <span class="json-bracket">{bracket()[1]}</span>
            <span class="json-comma">{comma()}</span>
          </div>
        </Show>
      </Show>
    </div>
  );
};

const JsonViewer: Component<{ content: string }> = (props) => {
  const [expandAll, setExpandAll] = createSignal(0);

  const parsed = createMemo(() => {
    try {
      return { ok: true as const, data: JSON.parse(props.content) };
    } catch (e) {
      return { ok: false as const, error: String(e) };
    }
  });

  function handleExpandAll() {
    setExpandAll((v) => Math.abs(v) + 1);
  }

  function handleCollapseAll() {
    setExpandAll((v) => -(Math.abs(v) + 1));
  }

  return (
    <div class="json-viewer">
      <div class="json-toolbar">
        <span class="json-toolbar-title">JSON</span>
        <button class="json-toolbar-btn" onClick={handleExpandAll}>Expand All</button>
        <button class="json-toolbar-btn" onClick={handleCollapseAll}>Collapse All</button>
      </div>
      <div class="json-tree">
        <Show when={parsed().ok} fallback={
          <div class="json-error">
            <span class="json-error-label">Parse Error</span>
            <pre class="json-error-message">{(parsed() as { ok: false; error: string }).error}</pre>
          </div>
        }>
          <JsonNode
            value={(parsed() as { ok: true; data: unknown }).data}
            depth={0}
            expandAll={expandAll()}
            last={true}
          />
        </Show>
      </div>
    </div>
  );
};

export default JsonViewer;
