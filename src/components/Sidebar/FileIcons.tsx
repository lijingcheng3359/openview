import { JSX } from "solid-js";

const s = { width: "16px", height: "16px", "flex-shrink": "0" } as JSX.CSSProperties;

function icon(children: JSX.Element): JSX.Element {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={s}>{children}</svg>;
}

const FolderClosed = () => icon(
  <path d="M1.5 2.5h4l1.5 1.5h7a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z" fill="currentColor" opacity="0.85"/>
);

const FolderOpen = () => icon(
  <>
    <path d="M1.5 2.5h4l1.5 1.5h7a1 1 0 0 1 1 1V7H6.5L5 8.5H1.5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z" fill="currentColor" opacity="0.65"/>
    <path d="M1 7h5.5l1.5-1h6.5l-2 6.5a1 1 0 0 1-1 .5H1.5a1 1 0 0 1-1-1L1 7z" fill="currentColor" opacity="0.85"/>
  </>
);

const DocDefault = () => icon(
  <path d="M4 1.5h5.5L13 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5A1 1 0 0 1 4 1.5zm5 0v4h4" stroke="currentColor" stroke-width="1.2" fill="none"/>
);

const DocTS = () => icon(
  <>
    <path d="M4 1.5h5.5L13 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5A1 1 0 0 1 4 1.5z" fill="currentColor" opacity="0.12"/>
    <text x="4.5" y="12.5" font-size="7.5" font-weight="700" font-family="-apple-system,system-ui,sans-serif" fill="currentColor">TS</text>
  </>
);

const DocJS = () => icon(
  <>
    <path d="M4 1.5h5.5L13 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5A1 1 0 0 1 4 1.5z" fill="currentColor" opacity="0.12"/>
    <text x="4.5" y="12.5" font-size="7.5" font-weight="700" font-family="-apple-system,system-ui,sans-serif" fill="currentColor">JS</text>
  </>
);

const DocMarkup = () => icon(
  <>
    <path d="M4 1.5h5.5L13 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5A1 1 0 0 1 4 1.5z" fill="currentColor" opacity="0.12"/>
    <text x="3" y="12.5" font-size="8" font-weight="700" font-family="-apple-system,system-ui,sans-serif" fill="currentColor">&lt;/&gt;</text>
  </>
);

const DocStyle = () => icon(
  <>
    <path d="M4 1.5h5.5L13 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5A1 1 0 0 1 4 1.5z" fill="currentColor" opacity="0.12"/>
    <text x="5" y="12.5" font-size="9" font-weight="700" font-family="-apple-system,system-ui,sans-serif" fill="currentColor">#</text>
  </>
);

const DocConfig = () => icon(
  <>
    <path d="M4 1.5h5.5L13 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5A1 1 0 0 1 4 1.5z" fill="currentColor" opacity="0.12"/>
    <path d="M8 6.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 1.2a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6z" fill="currentColor"/>
    <path d="M7.5 5.5V6.3M8.5 5.5V6.3M7.5 10.7v.8M8.5 10.7v.8M5.5 8v1M10.5 8v1M6.1 6.6l.5.5M9.4 9.9l.5.5M6.1 10.4l.5-.5M9.4 7.1l.5-.5" stroke="currentColor" stroke-width="0.7"/>
  </>
);

const DocMarkdown = () => icon(
  <>
    <path d="M4 1.5h5.5L13 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5A1 1 0 0 1 4 1.5z" fill="currentColor" opacity="0.12"/>
    <path d="M4.5 11V7l2 2.5L8.5 7v4M10 11V8.5l1.5 2 1.5-2V11" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </>
);

const DocRust = () => icon(
  <>
    <path d="M4 1.5h5.5L13 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5A1 1 0 0 1 4 1.5z" fill="currentColor" opacity="0.12"/>
    <text x="4.5" y="12.5" font-size="7.5" font-weight="700" font-family="-apple-system,system-ui,sans-serif" fill="currentColor">Rs</text>
  </>
);

const DocGo = () => icon(
  <>
    <path d="M4 1.5h5.5L13 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5A1 1 0 0 1 4 1.5z" fill="currentColor" opacity="0.12"/>
    <text x="3.5" y="12.5" font-size="7.5" font-weight="700" font-family="-apple-system,system-ui,sans-serif" fill="currentColor">Go</text>
  </>
);

const DocPython = () => icon(
  <>
    <path d="M4 1.5h5.5L13 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5A1 1 0 0 1 4 1.5z" fill="currentColor" opacity="0.12"/>
    <text x="4.5" y="12.5" font-size="7.5" font-weight="700" font-family="-apple-system,system-ui,sans-serif" fill="currentColor">Py</text>
  </>
);

const DocShell = () => icon(
  <>
    <path d="M4 1.5h5.5L13 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5A1 1 0 0 1 4 1.5z" fill="currentColor" opacity="0.12"/>
    <path d="M5 8l2 1.5L5 11M8.5 11H11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </>
);

const DocData = () => icon(
  <>
    <path d="M4 1.5h5.5L13 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5A1 1 0 0 1 4 1.5z" fill="currentColor" opacity="0.12"/>
    <path d="M4.5 7h7M4.5 9.5h7M7.5 5.5v6M4.5 5.5h7v6h-7z" stroke="currentColor" stroke-width="0.8" fill="none"/>
  </>
);

const DocImage = () => icon(
  <>
    <path d="M4 1.5h5.5L13 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5A1 1 0 0 1 4 1.5z" fill="currentColor" opacity="0.12"/>
    <circle cx="6.5" cy="7.5" r="1.2" fill="currentColor" opacity="0.6"/>
    <path d="M3.5 12.5l3-3.5 2 2 1.5-1.5 2.5 3z" fill="currentColor" opacity="0.5"/>
  </>
);

const EXT_ICON_MAP: Record<string, () => JSX.Element> = {
  ts: DocTS, tsx: DocTS,
  js: DocJS, jsx: DocJS, mjs: DocJS, cjs: DocJS,
  html: DocMarkup, htm: DocMarkup, xml: DocMarkup, svg: DocMarkup,
  css: DocStyle, scss: DocStyle, less: DocStyle,
  json: DocConfig, jsonl: DocConfig, yaml: DocConfig, yml: DocConfig,
  toml: DocConfig, ini: DocConfig, conf: DocConfig, cfg: DocConfig,
  properties: DocConfig, env: DocConfig,
  md: DocMarkdown, markdown: DocMarkdown, mdx: DocMarkdown,
  rs: DocRust,
  go: DocGo,
  py: DocPython,
  sh: DocShell, bash: DocShell, zsh: DocShell, fish: DocShell,
  csv: DocData, tsv: DocData, sql: DocData, sqlite: DocData, db: DocData,
  png: DocImage, jpg: DocImage, jpeg: DocImage, gif: DocImage,
  webp: DocImage, bmp: DocImage, ico: DocImage,
};

export function getFileIcon(filename: string, isDir: boolean, expanded: boolean): JSX.Element {
  if (isDir) {
    return expanded ? <FolderOpen /> : <FolderClosed />;
  }
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext && ext !== filename.toLowerCase()) {
    const Icon = EXT_ICON_MAP[ext];
    if (Icon) return <Icon />;
  }
  return <DocDefault />;
}
