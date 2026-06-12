# OpenView — Developer File Viewer & Editor

## Overview

A lightweight, high-performance file viewer and editor for macOS, designed for developers. Supports Markdown editing with live preview, interactive CSV tables, Mermaid diagram rendering, and Git integration (log & diff). Performance target: approaching Sublime Text responsiveness.

## Core Requirements

### 1. Markdown Editor & Preview

- Split-pane: left editor, right live preview
- Syntax highlighting in editor
- GFM (GitHub Flavored Markdown) support: tables, task lists, footnotes, strikethrough
- Scroll sync between editor and preview
- Large file support (100K+ lines without lag)

### 2. CSV Viewer (Interactive)

- Render CSV as a table with virtual scrolling (handle 100K+ rows)
- Column sorting (ascending / descending / original order)
- Column filtering (text match, numeric range)
- Column resizing and reordering
- Auto-detect delimiter (comma, tab, semicolon, pipe)
- Search across all cells
- Read-only by default; no inline editing required in v1

### 3. Mermaid Diagram Rendering

- Render Mermaid syntax as diagrams (flowchart, sequence, mindmap, gantt, etc.)
- Live preview as user types
- Pan and zoom on rendered diagram
- Export diagram as PNG / SVG

### 4. Git Integration

- **Git Log**: commit history list with author, date, message; branch/tag labels; optional graph view (branch topology)
- **Git Diff**: file-level diff view (unified & side-by-side); line-level syntax highlighting; stage/unstage not required in v1
- Auto-detect if opened directory is a git repository
- Graceful degradation: Git features hidden when not in a git repo

### 5. General UX

- File tree sidebar with directory browsing
- Tab-based multi-file support
- File type auto-detection to switch render mode (md / csv / mermaid / git)
- Dark & light theme
- Keyboard-driven navigation (Vim keybindings optional in v2)
- Native macOS look and feel (title bar, traffic lights, system font)

## Non-Functional Requirements

- **Startup time**: < 500ms cold start
- **Memory**: < 100MB for typical usage (10 open files)
- **Binary size**: < 20MB
- **Dependency footprint**: minimal; prefer system-provided components (WebKit)
- **Platform**: macOS 13+ (Ventura and later)

## Technical Architecture

### Stack

```
┌─────────────────────────────────────────────┐
│                 Frontend (WebView)           │
│  Framework: Solid.js (7KB, fine-grained)     │
│  Build: Vite                                 │
│                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ Markdown │ │   CSV    │ │   Mermaid    │ │
│  │ Preview  │ │  Table   │ │   Diagram    │ │
│  │ (HTML)   │ │(TanStack)│ │ (mermaid.js) │ │
│  └──────────┘ └──────────┘ └──────────────┘ │
│  ┌──────────────────┐ ┌──────────────────┐  │
│  │    Git Log        │ │    Git Diff      │  │
│  │ (custom list)     │ │  (diff2html)     │  │
│  └──────────────────┘ └──────────────────┘  │
│                                              │
│  Editor: CodeMirror 6 (modular, tree-sitter) │
└────────────────────┬────────────────────────┘
                     │ Tauri IPC (JSON commands)
┌────────────────────┴────────────────────────┐
│              Rust Backend (Tauri 2)          │
│                                              │
│  ┌────────────┐ ┌─────────┐ ┌────────────┐  │
│  │  pulldown  │ │   csv   │ │    git2    │  │
│  │  -cmark    │ │  crate  │ │   crate    │  │
│  │ (MD→HTML)  │ │(parsing)│ │(log, diff) │  │
│  └────────────┘ └─────────┘ └────────────┘  │
│                                              │
│  File watcher: notify crate                  │
│  Async runtime: tokio                        │
│  Serialization: serde + serde_json           │
└──────────────────────────────────────────────┘
```

### Key Libraries

| Layer | Component | Library | Size | Why |
|-------|-----------|---------|------|-----|
| Rust | Markdown parser | pulldown-cmark | ~50KB | Pure Rust, GFM support, streaming |
| Rust | CSV parser | csv | ~30KB | Serde integration, fast |
| Rust | Git operations | git2 | ~2MB | libgit2 bindings, full git API |
| Rust | File watcher | notify | ~100KB | Cross-platform fs events |
| Rust | Framework | tauri 2 | ~3MB | System WebView, small binary |
| JS | UI framework | Solid.js | 7KB | Fine-grained reactivity, fast |
| JS | Editor | CodeMirror 6 | ~150KB | Modular, extensible, mobile-ready |
| JS | CSV table | TanStack Table | 15KB | Headless, sort/filter built-in |
| JS | Virtual scroll | TanStack Virtual | 5KB | Pairs with TanStack Table |
| JS | Mermaid | mermaid.js | ~200KB | De facto standard |
| JS | Git diff | diff2html | 40KB | Unified + side-by-side diff |

### IPC Command Design

```typescript
// Frontend → Rust (invoke)
readFile(path: string): string
readDir(path: string): FileEntry[]
parseMarkdown(content: string): string        // returns HTML
parseCsv(path: string, options: CsvOptions): CsvData
gitLog(repoPath: string, options: LogOptions): Commit[]
gitDiff(repoPath: string, ref1: string, ref2: string): DiffResult
watchPath(path: string): void

// Rust → Frontend (events)
onFileChanged(path: string): void
```

### Performance Strategies

1. **Incremental parsing**: pulldown-cmark streams Markdown → HTML; avoid re-parsing entire document on each keystroke
2. **Debounced preview**: 150ms debounce on Markdown/Mermaid preview updates
3. **Virtual scrolling**: CSV tables and Git log only render visible rows
4. **Rust-side parsing**: all heavy parsing (MD, CSV, Git) happens in Rust; frontend only renders
5. **Lazy loading**: Git log fetches commits in pages (50 per batch)
6. **Web Worker**: Mermaid rendering in a Web Worker to avoid blocking UI thread

## Project Structure

```
open-view/
├── src-tauri/
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/
│   │   │   ├── mod.rs
│   │   │   ├── file.rs        # file read/write/watch
│   │   │   ├── markdown.rs    # MD → HTML
│   │   │   ├── csv.rs         # CSV parsing
│   │   │   └── git.rs         # git log, diff
│   │   └── lib.rs
│   └── tauri.conf.json
├── src/
│   ├── index.html
│   ├── index.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── Sidebar/           # file tree
│   │   ├── Editor/            # CodeMirror wrapper
│   │   ├── MarkdownPreview/   # rendered HTML
│   │   ├── CsvViewer/         # TanStack Table
│   │   ├── MermaidViewer/     # mermaid.js
│   │   ├── GitLog/            # commit history
│   │   └── GitDiff/           # diff2html
│   ├── stores/                # Solid.js stores
│   └── styles/
├── package.json
├── vite.config.ts
├── tsconfig.json
└── SPEC.md
```

## Milestones

### v0.1 — Skeleton

- Tauri 2 project scaffolding
- File tree sidebar + tab system
- Open and display plain text files

### v0.2 — Markdown

- CodeMirror 6 editor with Markdown syntax highlighting
- Live preview with pulldown-cmark
- Scroll sync

### v0.3 — CSV

- CSV parsing in Rust
- TanStack Table with virtual scrolling
- Column sorting and filtering

### v0.4 — Mermaid

- Mermaid.js integration
- Live preview
- Pan/zoom and export

### v0.5 — Git

- Git repo detection
- Git log with commit list
- Git diff viewer (unified + side-by-side)

### v0.6 — Polish

- Dark/light theme
- Keyboard shortcuts
- Performance optimization pass
- macOS native integration (menu bar, Dock, open-with)
