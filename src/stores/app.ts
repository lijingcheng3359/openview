import { createSignal, createRoot } from "solid-js";

export type ViewMode = "markdown" | "csv" | "mermaid" | "plaintext" | "git-log" | "git-diff";

export interface RecentProject {
  path: string;
  name: string;
  timestamp: number;
}

const RECENT_KEY = "openview_recent_projects";
const MAX_RECENT = 10;

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
