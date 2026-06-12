import { Component, createSignal, createMemo, createEffect, For, Show, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import "./SqliteViewer.css";

interface SqliteData {
  headers: string[];
  rows: string[][];
  total_rows: number;
}

type SortDir = "asc" | "desc" | null;

const SqliteViewer: Component<{ path: string }> = (props) => {
  const [tables, setTables] = createSignal<string[]>([]);
  const [selectedTable, setSelectedTable] = createSignal<string | null>(null);
  const [data, setData] = createSignal<SqliteData | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [sortCol, setSortCol] = createSignal<number | null>(null);
  const [sortDir, setSortDir] = createSignal<SortDir>(null);
  const [filters, setFilters] = createSignal<Record<number, string>>({});
  const [globalFilter, setGlobalFilter] = createSignal("");
  const [showFilters, setShowFilters] = createSignal(false);

  onMount(async () => {
    try {
      const tableList = await invoke<string[]>("sqlite_list_tables", { path: props.path });
      setTables(tableList);
      if (tableList.length > 0) {
        setSelectedTable(tableList[0]);
      }
    } catch (e: any) {
      setError(String(e));
    }
  });

  createEffect(() => {
    const table = selectedTable();
    if (!table) return;
    loadTable(table);
  });

  async function loadTable(table: string) {
    setLoading(true);
    setError(null);
    setSortCol(null);
    setSortDir(null);
    setFilters({});
    setGlobalFilter("");
    try {
      const result = await invoke<SqliteData>("sqlite_query_table", {
        path: props.path,
        table,
        offset: null,
        limit: null,
      });
      setData(result);
    } catch (e: any) {
      setError(String(e));
      setData(null);
    }
    setLoading(false);
  }

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
    <div class="sqlite-viewer">
      <div class="sqlite-toolbar">
        <select
          class="sqlite-table-select"
          value={selectedTable() ?? ""}
          onChange={(e) => setSelectedTable(e.currentTarget.value)}
        >
          <For each={tables()}>
            {(t) => <option value={t}>{t}</option>}
          </For>
        </select>
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

      <Show when={loading()}>
        <div class="sqlite-loading">Loading...</div>
      </Show>

      <div class="csv-table-container">
        <Show when={data() && !loading()}>
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
                      {(cell) => (
                        <td classList={{ "null-cell": cell === "NULL" }}>{cell}</td>
                      )}
                    </For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </div>

      <Show when={tables().length === 0 && !error() && !loading()}>
        <div class="sqlite-empty">No tables found in this database.</div>
      </Show>
    </div>
  );
};

export default SqliteViewer;
