# OpenView

A lightweight, high-performance file viewer and editor for macOS, built with [Tauri 2](https://tauri.app/) + [Solid.js](https://www.solidjs.com/).

![OpenView Preview](preview.png)

## Features

- **Markdown Editor** — Split-pane editor with live preview, GFM support, hover-to-expand interaction
- **CSV Viewer** — Interactive table with sorting, filtering, and search across all cells
- **Mermaid Diagrams** — Live rendering with pan & zoom, error recovery
- **Git Integration** — Commit history, per-file diff viewer with file sidebar
- **Project Switcher** — Quick switch between recent projects (remembers last 10)
- **File Search** — Recursive filename search across the entire project

## Tech Stack

| Layer | Technology |
|-------|-----------|
| App Framework | Tauri 2 (Rust + system WebKit) |
| Frontend | Solid.js |
| Text Editor | CodeMirror 6 |
| Markdown | pulldown-cmark (Rust, SIMD) |
| CSV | csv crate (Rust) |
| Git | git2 (libgit2 bindings) |
| Diagrams | mermaid.js |
| Diff | diff2html |

## Performance

- ~7 MB binary, ~73 MB memory usage
- No bundled browser engine (uses system WebKit)
- Rust-powered file parsing with SIMD acceleration

## Build

### Prerequisites

- [Rust](https://rustup.rs/) (1.86+)
- [Node.js](https://nodejs.org/) (22+)
- macOS 12+

### Development

```bash
npm install
npx tauri dev
```

### Production Build

```bash
npx tauri build
```

The built app is at `src-tauri/target/release/bundle/macos/OpenView.app`.

## License

[MIT](LICENSE)
