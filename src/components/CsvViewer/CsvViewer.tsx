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
const DISTINCT_CAP = 200; // columns with more distinct values fall back to a text input

const CsvViewer: Component<{ path: string }> = (props) => {
  const [data, setData] = createSignal<CsvData | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [sortCol, setSortCol] = createSignal<number | null>(null);
  const [sortDir, setSortDir] = createSignal<SortDir>(null);
  // Two-tier filter signals: the raw input value (immediate, drives the input
  // box) and the debounced value (drives the expensive filtering memo).
  const [filters, setFilters] = createSignal<Record<number, string>>({});
  const [debouncedFilters, setDebouncedFilters] = createSignal<Record<number, string>>({});
  // Multi-select filters: per-column set of chosen values (OR within a column).
  const [selected, setSelected] = createSignal<Record<number, Set<string>>>({});
  const [debouncedSelected, setDebouncedSelected] = createSignal<Record<number, Set<string>>>({});
  const [globalFilter, setGlobalFilter] = createSignal("");
  const [debouncedGlobal, setDebouncedGlobal] = createSignal("");
  const [showFilters, setShowFilters] = createSignal(false);
  // Which column's dropdown popover is open (only one at a time), and its anchor.
  const [openCol, setOpenCol] = createSignal<number | null>(null);
  const [popoverPos, setPopoverPos] = createSignal<{ x: number; y: number } | null>(null);
  const [optionQuery, setOptionQuery] = createSignal("");

  let scrollRef: HTMLDivElement | undefined;
  let globalTimer: number | undefined;
  let filterTimer: number | undefined;
  let selectTimer: number | undefined;

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

  function onDocClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest(".csv-filter-popover") || target.closest(".csv-filter-select")) return;
    closePopover();
  }

  onMount(() => document.addEventListener("mousedown", onDocClick));

  onCleanup(() => {
    clearTimeout(globalTimer);
    clearTimeout(filterTimer);
    clearTimeout(selectTimer);
    document.removeEventListener("mousedown", onDocClick);
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

  // Distinct values per column with their row counts; null means the column is
  // high-cardinality and falls back to a text input instead of a dropdown.
  const columnOptions = createMemo<({ value: string; count: number }[] | null)[]>(() => {
    const d = data();
    if (!d) return [];
    return d.headers.map((_, col) => {
      const counts = new Map<string, number>();
      for (const row of d.rows) {
        const v = row[col] ?? "";
        counts.set(v, (counts.get(v) ?? 0) + 1);
        if (counts.size > DISTINCT_CAP) return null;
      }
      return [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value));
    });
  });

  function toggleSelected(colIdx: number, value: string) {
    setSelected((prev) => {
      const next = new Set(prev[colIdx] ?? []);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...prev, [colIdx]: next };
    });
    clearTimeout(selectTimer);
    selectTimer = window.setTimeout(() => setDebouncedSelected({ ...selected() }), FILTER_DEBOUNCE);
  }

  function clearSelected(colIdx: number) {
    setSelected((prev) => ({ ...prev, [colIdx]: new Set() }));
    setDebouncedSelected({ ...selected() });
  }

  function openPopover(colIdx: number, e: MouseEvent) {
    if (openCol() === colIdx) {
      closePopover();
      return;
    }
    const btn = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopoverPos({ x: btn.left, y: btn.bottom + 2 });
    setOptionQuery("");
    setOpenCol(colIdx);
  }

  function closePopover() {
    setOpenCol(null);
    setPopoverPos(null);
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

    // Multi-select: keep rows whose value is one of the chosen set (OR within
    // a column; AND across columns, matching the text-filter semantics).
    const sel = debouncedSelected();
    for (const [colStr, set] of Object.entries(sel)) {
      if (!set || set.size === 0) continue;
      const col = Number(colStr);
      rows = rows.filter((row) => set.has(row[col] ?? ""));
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
                    <Show
                      when={columnOptions()[i()] !== null}
                      fallback={
                        <input
                          type="text"
                          class="csv-filter-input"
                          placeholder="Filter..."
                          value={filters()[i()] ?? ""}
                          onInput={(e) => updateFilter(i(), e.currentTarget.value)}
                        />
                      }
                    >
                      <button
                        class="csv-filter-select"
                        classList={{ active: (selected()[i()]?.size ?? 0) > 0 }}
                        onClick={(e) => openPopover(i(), e)}
                      >
                        <span>
                          {(selected()[i()]?.size ?? 0) > 0
                            ? `${selected()[i()]!.size} selected`
                            : "All"}
                        </span>
                        <span class="csv-filter-caret">▾</span>
                      </button>
                    </Show>
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
                    <For each={row()}>{(cell) => <div class="csv-td" title={cell}>{cell}</div>}</For>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </div>

      <Show when={openCol() !== null && popoverPos()}>
        {(() => {
          const col = openCol()!;
          const opts = () => columnOptions()[col] ?? [];
          const visible = createMemo(() => {
            const q = optionQuery().toLowerCase();
            return q ? opts().filter((o) => o.value.toLowerCase().includes(q)) : opts();
          });
          return (
            <div
              class="csv-filter-popover"
              style={{ left: `${popoverPos()!.x}px`, top: `${popoverPos()!.y}px` }}
            >
              <input
                type="text"
                class="csv-filter-search"
                placeholder="Search options..."
                value={optionQuery()}
                onInput={(e) => setOptionQuery(e.currentTarget.value)}
              />
              <div class="csv-filter-options">
                <For each={visible()}>
                  {(opt) => (
                    <label class="csv-filter-option">
                      <input
                        type="checkbox"
                        checked={selected()[col]?.has(opt.value) ?? false}
                        onChange={() => toggleSelected(col, opt.value)}
                      />
                      <span class="csv-filter-option-label">
                        {opt.value === "" ? "(empty)" : opt.value}
                      </span>
                      <span class="csv-filter-option-count">{opt.count}</span>
                    </label>
                  )}
                </For>
                <Show when={visible().length === 0}>
                  <div class="csv-filter-empty">No options</div>
                </Show>
              </div>
              <div class="csv-filter-actions">
                <button class="csv-filter-clear" onClick={() => clearSelected(col)}>
                  Clear
                </button>
              </div>
            </div>
          );
        })()}
      </Show>
    </div>
  );
};

export default CsvViewer;
