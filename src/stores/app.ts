import { createSignal, createRoot } from "solid-js";
import { pinyin } from "pinyin-pro";

export type ViewMode = "markdown" | "csv" | "mermaid" | "json" | "image" | "sqlite" | "code" | "plaintext" | "git-log" | "git-diff";

export interface RecentProject {
  path: string;
  name: string;
  timestamp: number;
}

const RECENT_KEY = "openview_recent_projects";
const MAX_RECENT = 21;

export function getRecentProjects(): RecentProject[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addRecentProject(path: string): void {
  const name = path.split("/").pop() || path;
  const list = getRecentProjects().filter((p) => p.path !== path);
  list.unshift({ path, name, timestamp: Date.now() });
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
}

const pinyinCache = new Map<string, { full: string; initials: string }>();

function getPinyinFor(name: string): { full: string; initials: string } {
  let entry = pinyinCache.get(name);
  if (!entry) {
    const full = pinyin(name, { toneType: "none", type: "array" }).join("").toLowerCase();
    const initials = pinyin(name, { pattern: "first", toneType: "none", type: "array" }).join("").toLowerCase();
    entry = { full, initials };
    pinyinCache.set(name, entry);
  }
  return entry;
}

export function matchRecentProject(project: RecentProject, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = project.name.toLowerCase();
  const path = project.path.toLowerCase();
  if (name.includes(q) || path.includes(q)) return true;
  const { full, initials } = getPinyinFor(project.name);
  return full.includes(q) || initials.includes(q);
}

export interface Tab {
  id: string;
  name: string;
  path: string;
  mode: ViewMode;
  content?: string;
}

function createAppStore() {
  const [rootPath, setRootPath] = createSignal<string | null>(null);
  const [tabs, setTabs] = createSignal<Tab[]>([]);
  const [activeTabId, setActiveTabId] = createSignal<string | null>(null);
  const [isGitRepo, setIsGitRepo] = createSignal(false);
  const [sidebarWidth, setSidebarWidth] = createSignal(250);

  function detectMode(filename: string): ViewMode {
    const base = filename.toLowerCase();
    if (base === "makefile" || base === "dockerfile" || base === "cmakelists.txt" || base === "gemfile" || base === "rakefile") {
      return "code";
    }
    const ext = filename.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "md":
      case "markdown":
        return "markdown";
      case "csv":
      case "tsv":
        return "csv";
      case "mmd":
      case "mermaid":
        return "mermaid";
      case "json":
      case "jsonl":
        return "json";
      case "sqlite":
      case "sqlite3":
      case "db":
        return "sqlite";
      case "png":
      case "jpg":
      case "jpeg":
      case "gif":
      case "webp":
      case "svg":
      case "bmp":
      case "ico":
        return "image";
      case "py":
      case "js":
      case "jsx":
      case "ts":
      case "tsx":
      case "go":
      case "rs":
      case "java":
      case "c":
      case "cpp":
      case "cc":
      case "cxx":
      case "h":
      case "hpp":
      case "hxx":
      case "cs":
      case "rb":
      case "php":
      case "sh":
      case "bash":
      case "zsh":
      case "fish":
      case "css":
      case "scss":
      case "less":
      case "html":
      case "htm":
      case "xml":
      case "yaml":
      case "yml":
      case "toml":
      case "ini":
      case "conf":
      case "cfg":
      case "properties":
      case "sql":
      case "swift":
      case "kt":
      case "kts":
      case "scala":
      case "lua":
      case "r":
      case "pl":
      case "pm":
      case "ex":
      case "exs":
      case "erl":
      case "hs":
      case "ml":
      case "clj":
      case "dart":
      case "vue":
      case "svelte":
      case "zig":
      case "nim":
      case "v":
      case "d":
      case "m":
      case "mm":
      case "gradle":
      case "cmake":
      case "make":
      case "dockerfile":
      case "tf":
      case "hcl":
      case "proto":
      case "graphql":
      case "gql":
      case "wasm":
      case "wat":
        return "code";
      default:
        return "plaintext";
    }
  }

  function openFile(path: string, name: string, content: string) {
    const tab: Tab = {
      id: crypto.randomUUID(),
      name,
      path,
      mode: detectMode(name),
      content,
    };
    setTabs([tab]);
    setActiveTabId(tab.id);
  }

  function closeTab(id: string) {
    const current = tabs();
    const idx = current.findIndex((t) => t.id === id);
    const next = current.filter((t) => t.id !== id);
    setTabs(next);

    if (activeTabId() === id) {
      if (next.length === 0) {
        setActiveTabId(null);
      } else {
        setActiveTabId(next[Math.min(idx, next.length - 1)].id);
      }
    }
  }

  function activeTab() {
    return tabs().find((t) => t.id === activeTabId()) ?? null;
  }

  function updateTabContent(id: string, content: string) {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, content } : t))
    );
  }

  return {
    rootPath,
    setRootPath,
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    isGitRepo,
    setIsGitRepo,
    sidebarWidth,
    setSidebarWidth,
    detectMode,
    openFile,
    closeTab,
    activeTab,
    updateTabContent,
  };
}

export const appStore = createRoot(createAppStore);
