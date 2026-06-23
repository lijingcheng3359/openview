# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

- **Dev:** `npx tauri dev` (starts Vite dev server + Rust backend with hot reload). Do NOT use `npm run dev` alone — that only starts the frontend without the Tauri shell.
- **Production build:** `npx tauri build` → output at `src-tauri/target/release/bundle/macos/OpenView.app`
- **Install deps:** `npm install` (frontend), Rust deps are managed via Cargo and build automatically.
- **Frontend tests:** `npm test` (Vitest, run once) or `npm run test:watch`. Specs live next to their source as `*.test.ts` under `src/`. Environment is `jsdom` (so `localStorage`/`crypto` are available). Only pure logic is tested — viewer components that need WebKit/mermaid/codemirror are not.
- **Rust tests:** `cd src-tauri && cargo test --lib`. Tests are inline `#[cfg(test)] mod tests` blocks. `#[tauri::command]` fns whose params are plain values (not `State`/`AppHandle`) are callable directly in tests; `tempfile` (dev-dep) + `git2` build throwaway dirs/repos as fixtures.
- **Scope:** only pure logic is covered — `buildGraph` (git graph layout), `detectMode`/tab/recent-project logic, and the `file`/`git` Rust commands. IPC wrappers, the file watcher, and DOM-bound viewers have no tests.

### Prerequisites

- Rust 1.86+ (pinned in `rust-toolchain.toml`)
- Node.js 22+
- macOS 12+ (this is a macOS-only app using system WebKit)

## Architecture

OpenView is a Tauri 2 desktop file viewer — Rust backend + Solid.js frontend rendered in macOS system WebKit.

### Frontend (Solid.js — NOT React)

- Uses Solid signals (`createSignal`, `createRoot`) — never use React hooks or `setState`.
- `tsconfig.json` sets `jsxImportSource: "solid-js"` and `jsx: "preserve"` — never add React types.
- **App store** (`src/stores/app.ts`): singleton created via `createRoot`. Owns all app state (rootPath, tabs, activeTab, isGitRepo, sidebarWidth). File type detection (`detectMode`) lives here, not in Rust.
- **Components** live in `src/components/<Name>/` with an `index.tsx` or `<Name>.tsx` entry point.
- **Routing by ViewMode**: `App.tsx` uses a `<Switch>/<Match>` on `tab.mode` to render the right viewer component. ViewMode is a union type: `markdown | csv | mermaid | json | image | sqlite | code | plaintext | git-log | git-diff`.
- **Key viewer libraries**: CodeMirror 6 (`@codemirror/*`) powers the code editor and markdown source editing; `@tanstack/solid-table` + `@tanstack/solid-virtual` render the virtualized CSV and SQLite tables; `diff2html` renders git diffs; `mermaid` renders diagrams. Prefer these existing deps over adding new ones.

### Backend (Rust)

- Tauri commands in `src-tauri/src/commands/` — modules: `file`, `markdown`, `csv_cmd`, `git`, `sqlite_cmd`. The `watcher` module is a top-level sibling of `commands` (`src-tauri/src/watcher.rs`), not inside it.
- New commands must be registered in `src-tauri/src/lib.rs` via `invoke_handler` (this includes `watcher::watch_path`).
- Key crates: `pulldown-cmark` (markdown with SIMD), `csv`, `git2` (libgit2), `rusqlite` (bundled SQLite), `notify` (filesystem watching).
- Frontend calls Rust via `invoke()` from `@tauri-apps/api/core`.
- **File watching**: `watch_path` watches the root dir recursively and emits a debounced (500ms) `fs-changed` event carrying the changed directory. Only one watcher exists at a time — calling `watch_path` again drops the previous one. The frontend listens for `fs-changed` to refresh the tree and reload open files.

### Frontend ↔ Backend boundary

Heavy parsing (markdown→HTML, CSV, git ops, SQLite queries) happens in Rust. The frontend receives processed data and handles rendering/interaction. File type detection is frontend-side in `detectMode`.

## Key Conventions

- Release profile uses LTO, strip, and `codegen-units = 1` — do not change without reason.
- Tauri capabilities are in `src-tauri/capabilities/default.json` — new permissions must be declared there.
- Asset protocol is enabled (`assetProtocol.enable: true`) for local file access via `convertFileSrc` (used for image viewing).
- CSP is set to `null` (disabled) to allow mermaid.js inline rendering.
- Window uses `titleBarStyle: "Overlay"` with `hiddenTitle: true` — draggable regions use `data-tauri-drag-region` attribute.
