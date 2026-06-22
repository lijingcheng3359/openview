// Computes a git "network graph" layout from a linear, top-to-bottom list of
// commits. Each row gets a lane (column) for its dot, plus the line segments
// drawn across the row. The commit dot sits at the vertical center of its row,
// so segments are expressed as top-half (top edge -> center) and bottom-half
// (center -> bottom edge) so every connection actually touches the node.

export interface GraphLine {
  fromLane: number; // lane at the start of the segment
  toLane: number; // lane at the end of the segment
  color: string;
  // Which half of the row this segment spans. "top" = top edge to dot center,
  // "bottom" = dot center to bottom edge, "full" = top edge to bottom edge.
  half: "top" | "bottom" | "full";
}

export interface GraphRow {
  commitLane: number; // lane the commit dot sits in
  color: string; // dot color
  lines: GraphLine[]; // segments to draw across this row
  laneCount: number; // number of lanes present at this row (column width)
}

const PALETTE = [
  "#e84855", // red
  "#3a86ff", // blue
  "#06b387", // green
  "#f4a300", // amber
  "#9b5de5", // purple
  "#ff6b6b", // coral
  "#00bbf9", // cyan
  "#f15bb5", // pink
  "#8ac926", // lime
  "#ff924c", // orange
];

interface CommitLike {
  hash: string;
  parents: string[];
}

// Each lane carries a stable color id so a branch keeps the SAME color for its
// whole lifetime even if it gets shifted into a different physical column when
// lanes to its left close. Color follows the branch, not the column index.
interface Lane {
  hash: string; // the commit this lane is waiting to render next
  colorId: number; // stable color index for this branch
}

function laneColor(colorId: number): string {
  return PALETTE[colorId % PALETTE.length];
}

export function buildGraph(commits: CommitLike[]): GraphRow[] {
  // `lanes[i]` = the branch occupying physical column i, or null if free.
  const lanes: (Lane | null)[] = [];
  const rows: GraphRow[] = [];
  let nextColorId = 0;

  for (const commit of commits) {
    // Snapshot of lanes as they enter this row (top edge).
    const lanesBefore = lanes.map((l) => (l ? { ...l } : null));

    // Find the lane this commit occupies. Multiple lanes can be waiting on the
    // same hash (a merge: two children both point at this commit as a parent).
    // The commit renders in the LEFTMOST such lane; the others collapse into it.
    let commitLane = lanes.findIndex((l) => l?.hash === commit.hash);
    let colorId: number;
    if (commitLane === -1) {
      // Branch tip — no lane awaits it. Claim a fresh column and a new color.
      commitLane = lanes.findIndex((l) => l === null);
      colorId = nextColorId++;
      if (commitLane === -1) {
        commitLane = lanes.length;
        lanes.push(null);
      }
    } else {
      colorId = lanes[commitLane]!.colorId;
    }
    const color = laneColor(colorId);

    // Free every other lane that was also waiting on this commit (the merge
    // collapse). Their incoming lines will be drawn as "top" segments into the
    // dot, then the lane disappears.
    const mergedFromLanes: number[] = [];
    for (let i = 0; i < lanes.length; i++) {
      if (i !== commitLane && lanes[i]?.hash === commit.hash) {
        mergedFromLanes.push(i);
        lanes[i] = null;
      }
    }

    // The commit consumes its own lane; the first parent continues straight down
    // in that SAME column so the branch keeps its place. Without this the first
    // parent could get reassigned to a reused gap and slide sideways.
    lanes[commitLane] = null;

    commit.parents.forEach((parentHash, i) => {
      const existing = lanes.findIndex((l) => l?.hash === parentHash);
      if (existing !== -1) {
        // Parent already awaited in another lane — this commit's branch merges
        // into it. No new lane; the bottom-half line draws the visual merge.
        return;
      }
      if (i === 0) {
        // First parent keeps the commit's column and color.
        lanes[commitLane] = { hash: parentHash, colorId };
      } else {
        // A merge parent's branch: give it a fresh color and the first free
        // column, preferring a column to the right of the commit lane so merge
        // lines fan outward instead of crossing back over existing branches.
        let slot = -1;
        for (let j = commitLane + 1; j < lanes.length; j++) {
          if (lanes[j] === null) {
            slot = j;
            break;
          }
        }
        if (slot === -1) {
          for (let j = 0; j < commitLane; j++) {
            if (lanes[j] === null) {
              slot = j;
              break;
            }
          }
        }
        if (slot === -1) {
          slot = lanes.length;
          lanes.push(null);
        }
        lanes[slot] = { hash: parentHash, colorId: nextColorId++ };
      }
    });

    // Trim trailing free lanes so the column count shrinks once branches end.
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop();
    }

    // Lanes as they leave this row (bottom edge).
    const lanesAfter = lanes.map((l) => (l ? { ...l } : null));

    const lines: GraphLine[] = [];

    // TOP HALF: every lane occupied at the top edge either feeds into this
    // commit's dot (incoming edge) or passes straight through to the bottom.
    lanesBefore.forEach((lane, fromLane) => {
      if (!lane) return;
      if (lane.hash === commit.hash) {
        // Incoming edge of this commit: top edge of its lane down to the dot.
        lines.push({
          fromLane,
          toLane: commitLane,
          color: laneColor(lane.colorId),
          half: "top",
        });
      } else {
        // Pass-through branch untouched by this commit. Find where the same
        // branch (matched by hash) sits at the bottom edge — usually the same
        // column, so this is a clean vertical line.
        const toLane = lanesAfter.findIndex((l) => l?.hash === lane.hash);
        if (toLane !== -1) {
          lines.push({
            fromLane,
            toLane,
            color: laneColor(lane.colorId),
            half: "full",
          });
        }
      }
    });

    // BOTTOM HALF: from the dot center down to each parent's bottom lane.
    commit.parents.forEach((parentHash) => {
      const toLane = lanesAfter.findIndex((l) => l?.hash === parentHash);
      if (toLane !== -1) {
        lines.push({
          fromLane: commitLane,
          toLane,
          color: laneColor(lanesAfter[toLane]!.colorId),
          half: "bottom",
        });
      }
    });

    const laneCount = Math.max(lanesBefore.length, lanesAfter.length);

    rows.push({ commitLane, color, lines, laneCount });
  }

  return rows;
}
