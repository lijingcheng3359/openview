import { Component, createSignal, createMemo, For, Show, onMount, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { createVirtualizer } from "@tanstack/solid-virtual";
import "./CsvViewer.css";

interface CsvData {
  headers: string[];
  rows: string[][];
  total_rows: number;
  delimiter: string;
}

type SortDir = "asc" | "desc" | null;

const ROW_H = 27; // px, fixed body row height for virtualization
const COL_W = 180; // px, fixed column width so header/body align without a <table>
const FILTER_DEBOUNCE = 200; // ms

const CsvViewer: Component<{ path: string }> = (props) => {
  const [data, setData] = createSignal<CsvData | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [sortCol, setSortCol] = createSignal<number | null>(null);
  const [sortDir, setSortDir] = createSignal<SortDir>(null);
  // Two-tier filter signals: the raw input value (immediate, drives the input
  // box) and the debounced value (drives the expensive filtering memo).
  const [filters, setFilters] = createSignal<Record<number, string>>({});
  const [debouncedFilters, setDebouncedFilters] = createSignal<Record<number, string>>({});
  const [globalFilter, setGlobalFilter] = createSignal("");
  const [debouncedGlobal, setDebouncedGlobal] = createSignal("");
  const [showFilters, setShowFilters] = createSignal(false);

  let scrollRef: HTMLDivElement | undefined;
  let globalTimer: number | undefined;
  let filterTimer: number | undefined;

  onMount(async () => {
    try {
      const result = await invoke<CsvData>("parse_csv", {
        path: props.path,
        offset: null,
        limit: null,
      });
      setData(result);
    } catch (e: any) {
      setError(String(e));
    }
  });

  onCleanup(() => {
    clearTimeout(globalTimer);
    clearTimeout(filterTimer);
  });

  function toggleSort(colIdx: number) {
    if (sortCol() === colIdx) {
      if (sortDir() === "asc") setSortDir("desc");
      else if (sortDir() === "desc") { setSortCol(null); setSortDir(null); }
    } else {
      setSortCol(colIdx);
      setSortDir("asc");
    }
  }

  function onGlobalInput(value: string) {
    setGlobalFilter(value);
    clearTimeout(globalTimer);
    globalTimer = window.setTimeout(() => setDebouncedGlobal(value), FILTER_DEBOUNCE);
  }

  function updateFilter(colIdx: number, value: string) {
    setFilters((prev) => ({ ...prev, [colIdx]: value }));
    clearTimeout(filterTimer);
    filterTimer = window.setTimeout(() => setDebouncedFilters(filters()), FILTER_DEBOUNCE);
  }

  const filteredRows = createMemo(() => {
    const d = data();
    if (!d) return [];
    let rows = d.rows;

    const gf = debouncedGlobal().toLowerCase();
    if (gf) {
      rows = rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(gf)));
    }

    const f = debouncedFilters();
    for (const [colStr, value] of Object.entries(f)) {
      if (!value) continue;
      const col = Number(colStr);
      const lv = value.toLowerCase();
      rows = rows.filter((row) => (row[col] ?? "").toLowerCase().includes(lv));
    }

    return rows;
  });

  const sortedRows = createMemo(() => {
    const rows = filteredRows();
    const col = sortCol();
    const dir = sortDir();
    if (col === null || dir === null) return rows;

    return [...rows].sort((a, b) => {
      const va = a[col] ?? "";
      const vb = b[col] ?? "";
      const na = Number(va);
      const nb = Number(vb);
      let cmp: number;
      if (!isNaN(na) && !isNaN(nb) && va !== "" && vb !== "") {
        cmp = na - nb;
      } else {
        cmp = va.localeCompare(vb);
      }
      return dir === "asc" ? cmp : -cmp;
    });
  });

  const rowVirtualizer = createVirtualizer({
    get count() {
      return sortedRows().length;
    },
    getScrollElement: () => scrollRef ?? null,
    estimateSize: () => ROW_H,
    overscan: 12,
  });

  const colWidth = () => `${COL_W}px`;

  return (
    <div class="csv-viewer">
      <div class="csv-toolbar">
        <input
          type="text"
          class="csv-search"
          placeholder="Search all cells..."
          value={globalFilter()}
          onInput={(e) => onGlobalInput(e.currentTarget.value)}
        />
        <button class="csv-btn" onClick={() => setShowFilters(!showFilters())}>
          {showFilters() ? "Hide Filters" : "Filters"}
        </button>
        <Show when={data()}>
          <span class="csv-info">
            {sortedRows().length} / {data()!.total_rows} rows
          </span>
        </Show>
      </div>

      <Show when={error()}>
        <div class="csv-error">{error()}</div>
      </Show>

      <div class="csv-table-container" ref={scrollRef} style={{ "--csv-col-w": colWidth() }}>
        <Show when={data()}>
          <div class="csv-row csv-head-row">
            <For each={data()!.headers}>
              {(header, i) => (
                <div class="csv-th">
                  <div class="csv-th-content sortable" onClick={() => toggleSort(i())}>
                    <span>{header}</span>
                    <Show when={sortCol() === i()}>
                      <span class="sort-indicator">{sortDir() === "asc" ? " ↑" : " ↓"}</span>
                    </Show>
                  </div>
                  <Show when={showFilters()}>
                    <input
                      type="text"
                      class="csv-filter-input"
                      placeholder="Filter..."
                      value={filters()[i()] ?? ""}
                      onInput={(e) => updateFilter(i(), e.currentTarget.value)}
                    />
                  </Show>
                </div>
              )}
            </For>
          </div>

          <div class="csv-body" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
            <For each={rowVirtualizer.getVirtualItems()}>
              {(vItem) => {
                const row = () => sortedRows()[vItem.index];
                return (
                  <div
                    class="csv-body-row"
                    style={{ height: `${ROW_H}px`, transform: `translateY(${vItem.start}px)` }}
                  >
                    <For each={row()}>{(cell) => <div class="csv-td">{cell}</div>}</For>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default CsvViewer;
