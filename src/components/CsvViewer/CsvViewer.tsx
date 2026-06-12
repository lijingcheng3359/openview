import { Component, createSignal, createMemo, For, Show, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import "./CsvViewer.css";

interface CsvData {
  headers: string[];
  rows: string[][];
  total_rows: number;
  delimiter: string;
}

type SortDir = "asc" | "desc" | null;

const CsvViewer: Component<{ path: string }> = (props) => {
  const [data, setData] = createSignal<CsvData | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [sortCol, setSortCol] = createSignal<number | null>(null);
  const [sortDir, setSortDir] = createSignal<SortDir>(null);
  const [filters, setFilters] = createSignal<Record<number, string>>({});
  const [globalFilter, setGlobalFilter] = createSignal("");
  const [showFilters, setShowFilters] = createSignal(false);

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

  function toggleSort(colIdx: number) {
    if (sortCol() === colIdx) {
      if (sortDir() === "asc") setSortDir("desc");
      else if (sortDir() === "desc") { setSortCol(null); setSortDir(null); }
    } else {
      setSortCol(colIdx);
      setSortDir("asc");
    }
  }

  function updateFilter(colIdx: number, value: string) {
    setFilters((prev) => ({ ...prev, [colIdx]: value }));
  }

  const filteredRows = createMemo(() => {
    const d = data();
    if (!d) return [];
    let rows = d.rows;

    const gf = globalFilter().toLowerCase();
    if (gf) {
      rows = rows.filter((row) =>
        row.some((cell) => cell.toLowerCase().includes(gf))
      );
    }

    const f = filters();
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

  return (
    <div class="csv-viewer">
      <div class="csv-toolbar">
        <input
          type="text"
          class="csv-search"
          placeholder="Search all cells..."
          value={globalFilter()}
          onInput={(e) => setGlobalFilter(e.currentTarget.value)}
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

      <div class="csv-table-container">
        <Show when={data()}>
          <table class="csv-table">
            <thead>
              <tr>
                <For each={data()!.headers}>
                  {(header, i) => (
                    <th>
                      <div
                        class="csv-th-content sortable"
                        onClick={() => toggleSort(i())}
                      >
                        <span>{header}</span>
                        <Show when={sortCol() === i()}>
                          <span class="sort-indicator">
                            {sortDir() === "asc" ? " ↑" : " ↓"}
                          </span>
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
                    </th>
                  )}
                </For>
              </tr>
            </thead>
            <tbody>
              <For each={sortedRows()}>
                {(row) => (
                  <tr>
                    <For each={row}>
                      {(cell) => <td>{cell}</td>}
                    </For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </div>
    </div>
  );
};

export default CsvViewer;
