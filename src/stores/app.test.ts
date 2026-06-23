import { describe, it, expect, beforeEach } from "vitest";
import { appStore, getRecentProjects, addRecentProject } from "./app";

describe("detectMode", () => {
  const { detectMode } = appStore;

  it("maps markdown extensions", () => {
    expect(detectMode("README.md")).toBe("markdown");
    expect(detectMode("notes.markdown")).toBe("markdown");
  });

  it("maps tabular extensions to csv", () => {
    expect(detectMode("data.csv")).toBe("csv");
    expect(detectMode("data.tsv")).toBe("csv");
  });

  it("maps sqlite database extensions", () => {
    expect(detectMode("app.sqlite")).toBe("sqlite");
    expect(detectMode("app.sqlite3")).toBe("sqlite");
    expect(detectMode("app.db")).toBe("sqlite");
  });

  it("maps image extensions", () => {
    for (const f of ["a.png", "a.jpg", "a.jpeg", "a.gif", "a.webp", "a.svg", "a.bmp", "a.ico"]) {
      expect(detectMode(f)).toBe("image");
    }
  });

  it("maps a wide range of source files to code", () => {
    for (const f of ["a.ts", "a.tsx", "a.py", "a.rs", "a.go", "a.java", "a.sql", "a.yaml", "a.sh"]) {
      expect(detectMode(f)).toBe("code");
    }
  });

  it("recognizes extensionless build files by name", () => {
    expect(detectMode("Makefile")).toBe("code");
    expect(detectMode("Dockerfile")).toBe("code");
    expect(detectMode("CMakeLists.txt")).toBe("code");
    expect(detectMode("Gemfile")).toBe("code");
    expect(detectMode("Rakefile")).toBe("code");
  });

  it("is case-insensitive for special filenames and extensions", () => {
    expect(detectMode("MAKEFILE")).toBe("code");
    expect(detectMode("DATA.CSV")).toBe("csv");
    expect(detectMode("Photo.PNG")).toBe("image");
  });

  it("falls back to plaintext for unknown extensions and no extension", () => {
    expect(detectMode("notes.xyz")).toBe("plaintext");
    expect(detectMode("LICENSE")).toBe("plaintext");
    expect(detectMode("noextension")).toBe("plaintext");
  });

  it("uses the last extension segment for multi-dot names", () => {
    expect(detectMode("archive.tar.gz")).toBe("plaintext");
    expect(detectMode("component.test.ts")).toBe("code");
  });
});

describe("tabs", () => {
  beforeEach(() => {
    appStore.setTabs([]);
    appStore.setActiveTabId(null);
  });

  it("openFile creates one active tab with detected mode", () => {
    appStore.openFile("/x/README.md", "README.md", "# hi");
    const tab = appStore.activeTab();
    expect(tab).not.toBeNull();
    expect(tab!.name).toBe("README.md");
    expect(tab!.mode).toBe("markdown");
    expect(tab!.content).toBe("# hi");
    expect(appStore.tabs()).toHaveLength(1);
  });

  it("updateTabContent mutates only the matching tab", () => {
    appStore.openFile("/x/a.md", "a.md", "old");
    const id = appStore.activeTabId()!;
    appStore.updateTabContent(id, "new");
    expect(appStore.activeTab()!.content).toBe("new");
  });

  it("closeTab clears active id when the last tab closes", () => {
    appStore.openFile("/x/a.md", "a.md", "");
    const id = appStore.activeTabId()!;
    appStore.closeTab(id);
    expect(appStore.tabs()).toHaveLength(0);
    expect(appStore.activeTabId()).toBeNull();
  });

  it("closeTab activates the neighbor when closing the active middle tab", () => {
    // openFile replaces tabs, so build a 3-tab state manually.
    const mk = (name: string) => ({
      id: name,
      name,
      path: "/" + name,
      mode: "plaintext" as const,
      content: "",
    });
    appStore.setTabs([mk("t0"), mk("t1"), mk("t2")]);
    appStore.setActiveTabId("t1");
    appStore.closeTab("t1");
    expect(appStore.tabs().map((t) => t.id)).toEqual(["t0", "t2"]);
    // Active falls to the tab now at the same index (t2).
    expect(appStore.activeTabId()).toBe("t2");
  });

  it("closeTab leaves active id untouched when closing a non-active tab", () => {
    const mk = (name: string) => ({
      id: name,
      name,
      path: "/" + name,
      mode: "plaintext" as const,
      content: "",
    });
    appStore.setTabs([mk("t0"), mk("t1")]);
    appStore.setActiveTabId("t0");
    appStore.closeTab("t1");
    expect(appStore.activeTabId()).toBe("t0");
  });
});

describe("recent projects", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns an empty list when nothing is stored", () => {
    expect(getRecentProjects()).toEqual([]);
  });

  it("returns an empty list when storage is corrupt", () => {
    localStorage.setItem("openview_recent_projects", "{not json");
    expect(getRecentProjects()).toEqual([]);
  });

  it("adds a project and derives its name from the path tail", () => {
    addRecentProject("/Users/me/dev/my-app");
    const list = getRecentProjects();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("my-app");
    expect(list[0].path).toBe("/Users/me/dev/my-app");
  });

  it("moves a re-added project to the front without duplicating", () => {
    addRecentProject("/a");
    addRecentProject("/b");
    addRecentProject("/a");
    const list = getRecentProjects();
    expect(list).toHaveLength(2);
    expect(list[0].path).toBe("/a");
    expect(list[1].path).toBe("/b");
  });

  it("caps the list at 10 most-recent entries", () => {
    for (let i = 0; i < 15; i++) addRecentProject("/p" + i);
    const list = getRecentProjects();
    expect(list).toHaveLength(10);
    // Newest first: /p14 down to /p5.
    expect(list[0].path).toBe("/p14");
    expect(list[9].path).toBe("/p5");
  });
});
