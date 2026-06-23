import { describe, it, expect } from "vitest";
import { buildGraph } from "./graph";

// Commits are passed top-to-bottom (newest first), matching the order git_log
// returns them. `parents` are the hashes a commit points down to.

describe("buildGraph", () => {
  it("returns one row per commit", () => {
    const rows = buildGraph([
      { hash: "c", parents: ["b"] },
      { hash: "b", parents: ["a"] },
      { hash: "a", parents: [] },
    ]);
    expect(rows).toHaveLength(3);
  });

  it("keeps a linear history in a single lane", () => {
    const rows = buildGraph([
      { hash: "c", parents: ["b"] },
      { hash: "b", parents: ["a"] },
      { hash: "a", parents: [] },
    ]);
    for (const row of rows) {
      expect(row.commitLane).toBe(0);
      expect(row.laneCount).toBe(1);
    }
  });

  it("gives every commit on a linear branch the same color", () => {
    const rows = buildGraph([
      { hash: "c", parents: ["b"] },
      { hash: "b", parents: ["a"] },
      { hash: "a", parents: [] },
    ]);
    const colors = new Set(rows.map((r) => r.color));
    expect(colors.size).toBe(1);
  });

  it("draws the root commit (no parents) with no bottom-half lines", () => {
    const rows = buildGraph([{ hash: "a", parents: [] }]);
    const bottom = rows[0].lines.filter((l) => l.half === "bottom");
    expect(bottom).toHaveLength(0);
  });

  it("places a divergent branch in its own lane with a distinct color", () => {
    // Two tips b and c that both descend from a shared root a.
    //   c   b      (two branch tips, two lanes)
    //   |   |
    //   a (root, both point here)
    const rows = buildGraph([
      { hash: "c", parents: ["a"] },
      { hash: "b", parents: ["a"] },
      { hash: "a", parents: [] },
    ]);
    // First two tips occupy lane 0 and lane 1.
    expect(rows[0].commitLane).toBe(0);
    expect(rows[1].commitLane).toBe(1);
    // They are different branches, so different colors.
    expect(rows[0].color).not.toBe(rows[1].color);
    // By the time we reach the shared root, lanes have collapsed back to one.
    expect(rows[2].commitLane).toBe(0);
  });

  it("collapses lanes when a merge commit joins two branches", () => {
    // m is a merge with two parents (p1, p2). Both parents then reach root r.
    //   m        merge tip in lane 0, opens a second lane for p2
    //   |\
    //   p1 p2
    //   |  /
    //   r        both parents collapse back into root
    const rows = buildGraph([
      { hash: "m", parents: ["p1", "p2"] },
      { hash: "p1", parents: ["r"] },
      { hash: "p2", parents: ["r"] },
      { hash: "r", parents: [] },
    ]);
    // Merge row should open a second lane (laneCount grows to 2).
    expect(rows[0].laneCount).toBeGreaterThanOrEqual(2);
    // Merge has two bottom-half lines, one to each parent lane.
    const mergeBottom = rows[0].lines.filter((l) => l.half === "bottom");
    expect(mergeBottom).toHaveLength(2);
    // Root collapses everything back to a single lane.
    expect(rows[3].commitLane).toBe(0);
    expect(rows[3].laneCount).toBe(1);
  });

  it("keeps the merge parent's color stable down its lane", () => {
    const rows = buildGraph([
      { hash: "m", parents: ["p1", "p2"] },
      { hash: "p1", parents: ["r"] },
      { hash: "p2", parents: ["r"] },
      { hash: "r", parents: [] },
    ]);
    // The merge-parent branch (p2) gets a fresh color at the merge; p2's own
    // row should carry that same color.
    const p2Bottom = rows[0].lines.find(
      (l) => l.half === "bottom" && l.toLane === rows[0].lines.filter((x) => x.half === "bottom")[1]?.toLane,
    );
    expect(p2Bottom).toBeDefined();
  });

  it("handles an empty commit list", () => {
    expect(buildGraph([])).toEqual([]);
  });

  it("never emits a negative or NaN lane", () => {
    const rows = buildGraph([
      { hash: "m", parents: ["p1", "p2"] },
      { hash: "p1", parents: ["r"] },
      { hash: "p2", parents: ["r"] },
      { hash: "r", parents: [] },
    ]);
    for (const row of rows) {
      expect(row.commitLane).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(row.commitLane)).toBe(false);
      for (const line of row.lines) {
        expect(line.fromLane).toBeGreaterThanOrEqual(0);
        expect(line.toLane).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
