import { describe, expect, it } from "vitest";
import {
  hasGitHistoryMetadataChange,
  isActiveFileAffected,
  isDirectoryListingAffected,
  isGitHistoryMetadataPath,
  isPathWithinRoot,
  isReferencedPathAffected,
  parentFsPath,
  payloadBelongsToRoot,
  type FsChangedPayload,
} from "./fsEvents";

const payload = (root: string, paths: string[], rescan = false): FsChangedPayload => ({ root, paths, rescan });

describe("filesystem event paths", () => {
  it("matches payloads only to their current root", () => {
    expect(payloadBelongsToRoot(payload("/Users/me/project", []), "/Users/me/project/")).toBe(true);
    expect(payloadBelongsToRoot(payload("/Users/me/project-old", []), "/Users/me/project")).toBe(false);
    expect(payloadBelongsToRoot(payload("/Users/me/project", []), null)).toBe(false);
  });

  it("finds macOS parent paths without escaping the filesystem root", () => {
    expect(parentFsPath("/Users/me/project/src/App.tsx")).toBe("/Users/me/project/src");
    expect(parentFsPath("/Users/me/project/src/")).toBe("/Users/me/project");
    expect(parentFsPath("/Users")).toBe("/");
    expect(parentFsPath("/")).toBe("/");
  });

  it("marks a directory listing for the directory itself or direct children", () => {
    const event = payload("/Users/me/project", [
      "/Users/me/project/src",
      "/Users/me/project/tests/unit/a.test.ts",
    ]);

    expect(isDirectoryListingAffected("/Users/me/project", event)).toBe(true);
    expect(isDirectoryListingAffected("/Users/me/project/src", event)).toBe(true);
    expect(isDirectoryListingAffected("/Users/me/project/tests/unit", event)).toBe(true);
    expect(isDirectoryListingAffected("/Users/me/project/tests", event)).toBe(false);
  });

  it("requires an exact active file path match", () => {
    const event = payload("/Users/me/project", [
      "/Users/me/project/src/App.tsx",
      "/Users/me/project/src/renamed.ts",
    ]);

    expect(isActiveFileAffected("/Users/me/project/src/App.tsx", event)).toBe(true);
    expect(isActiveFileAffected("/Users/me/project/src/App.ts", event)).toBe(false);
    expect(isActiveFileAffected("/Users/me/project/src/App.tsx/", event)).toBe(false);
    expect(isActiveFileAffected("/Users/me/project/src", event)).toBe(false);
  });

  it("checks root containment on path boundaries", () => {
    expect(isPathWithinRoot("/Users/me/project/src/App.tsx", "/Users/me/project")).toBe(true);
    expect(isPathWithinRoot("/Users/me/project-old/App.tsx", "/Users/me/project")).toBe(false);
    expect(isPathWithinRoot("/Users/me/project/src/App.tsx", "/")).toBe(true);
  });

  it("uses overflow batches as conservative refreshes", () => {
    const event = payload("/Users/me/project", [], true);
    expect(isDirectoryListingAffected("/Users/me/project/src", event)).toBe(true);
    expect(isActiveFileAffected("/Users/me/project/src/App.tsx", event)).toBe(true);
  });

  it("matches only changed paths referenced by the active document", () => {
    const references = [
      "/Users/me/project/assets/chart.png",
      "/Users/me/project/assets/photo.jpg",
    ];

    expect(isReferencedPathAffected(references, payload("/Users/me/project", [
      "/Users/me/project/notes.md",
      "/Users/me/project/assets/chart.png",
    ]))).toBe(true);
    expect(isReferencedPathAffected(references, payload("/Users/me/project", [
      "/Users/me/project/assets/other.png",
    ]))).toBe(false);
  });

  it("refreshes referenced paths on rescan only when dependencies exist", () => {
    const event = payload("/Users/me/project", [], true);

    expect(isReferencedPathAffected(["/Users/me/project/assets/chart.png"], event)).toBe(true);
    expect(isReferencedPathAffected([], event)).toBe(false);
  });
});

describe("git history metadata", () => {
  const root = "/Users/me/project";

  it("recognizes HEAD, packed refs, and loose refs", () => {
    expect(isGitHistoryMetadataPath(`${root}/.git/HEAD`, root)).toBe(true);
    expect(isGitHistoryMetadataPath(`${root}/.git/packed-refs`, root)).toBe(true);
    expect(isGitHistoryMetadataPath(`${root}/.git/refs`, root)).toBe(true);
    expect(isGitHistoryMetadataPath(`${root}/.git/refs/heads/main`, root)).toBe(true);
    expect(isGitHistoryMetadataPath(`${root}/.git/refs/tags/v1`, root)).toBe(true);
    expect(isGitHistoryMetadataPath("/.git/HEAD", "/")).toBe(true);
  });

  it("ignores worktree files and unrelated git internals", () => {
    expect(isGitHistoryMetadataPath(`${root}/src/App.tsx`, root)).toBe(false);
    expect(isGitHistoryMetadataPath(`${root}/.git/index`, root)).toBe(false);
    expect(isGitHistoryMetadataPath(`${root}/.git/objects/ab/cd`, root)).toBe(false);
    expect(isGitHistoryMetadataPath(`${root}-old/.git/HEAD`, root)).toBe(false);
  });

  it("detects history metadata in a rename batch", () => {
    const event = payload(root, [
      `${root}/.git/refs/heads/main.lock`,
      `${root}/.git/refs/heads/main`,
    ]);
    expect(hasGitHistoryMetadataChange(event, root)).toBe(true);
  });
});
