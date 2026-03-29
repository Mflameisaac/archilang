/**
 * Coordinate-compressed flood fill for room sub-area analysis.
 * Shared by resolver (sub_rooms) and validator (isolated subarea detection).
 */

import { Rect, WallEdge, ResolvedRoom } from './types.js';

const EPS = 0.5; // mm tolerance for coordinate comparisons

// ─── Types ───

export interface Barrier {
  kind: 'V' | 'H';
  /** For V: x position. For H: y position. */
  pos: number;
  /** Start of barrier range (y for V, x for H) */
  start: number;
  /** End of barrier range */
  end: number;
  wallId: string;
}

export interface FloodFillContext {
  /** Room bounding rect in mm */
  roomRect: Rect;
  /** Compressed X coordinates (sorted) */
  xs: number[];
  /** Compressed Y coordinates (sorted) */
  ys: number[];
  /** Cell index map: "i,j" → cell index (only cells inside room) */
  cellIdx: Map<string, number>;
  /** Area of each cell in mm² */
  cellAreas: number[];
  /** Total number of cells */
  cellCount: number;
  /** Adjacency list (blocked by barriers already applied) */
  adj: number[][];
  /** Barriers used */
  barriers: Barrier[];
  /** Blocking barrier indices per edge (for boundary detection) */
  blockingV: (x: number, y0: number, y1: number) => number[];
  blockingH: (y: number, x0: number, x1: number) => number[];
}

export interface RegionSummary {
  /** Bounding rect in mm */
  bounds: Rect;
  /** Center point in mm (centroid of bounding rect) */
  center: { x: number; y: number };
  /** Actual area in mm² (sum of cell areas) */
  areaMm2: number;
  /** Number of cells reached */
  cellCount: number;
  /** Indices of reached cells */
  reachedCells: number[];
}

// ─── Barrier extraction ───

/**
 * Find walls that cross through the interior of a room and act as barriers.
 * For multi-rect rooms, checks against individual component rects (not bounding rect)
 * to avoid false positives in void regions of concave shapes.
 */
export function findBarriersInRoom(room: ResolvedRoom, walls: WallEdge[]): Barrier[] {
  const barriers: Barrier[] = [];

  for (const w of walls) {
    const isVertical = Math.abs(w.x1 - w.x2) < EPS;
    const isHorizontal = Math.abs(w.y1 - w.y2) < EPS;

    if (isVertical) {
      const x = w.x1;
      // Find rects where x is strictly interior
      const interiorRects = room.rects.filter(r =>
        x > r.x + EPS && x < r.x + r.w - EPS
      );
      if (interiorRects.length === 0) continue;

      const wStart = Math.min(w.y1, w.y2);
      const wEnd = Math.max(w.y1, w.y2);

      // Clip wall range to each rect's y-range, then merge contiguous segments
      const yRanges = interiorRects
        .map(r => ({ start: Math.max(r.y, wStart), end: Math.min(r.y + r.h, wEnd) }))
        .filter(r => r.end - r.start > EPS)
        .sort((a, b) => a.start - b.start);
      if (yRanges.length === 0) continue;

      const merged = [{ ...yRanges[0] }];
      for (let i = 1; i < yRanges.length; i++) {
        const prev = merged[merged.length - 1];
        if (yRanges[i].start <= prev.end + EPS) {
          prev.end = Math.max(prev.end, yRanges[i].end);
        } else {
          merged.push({ ...yRanges[i] });
        }
      }
      for (const range of merged) {
        barriers.push({ kind: 'V', pos: x, start: range.start, end: range.end, wallId: w.id });
      }
    } else if (isHorizontal) {
      const y = w.y1;
      const interiorRects = room.rects.filter(r =>
        y > r.y + EPS && y < r.y + r.h - EPS
      );
      if (interiorRects.length === 0) continue;

      const wStart = Math.min(w.x1, w.x2);
      const wEnd = Math.max(w.x1, w.x2);

      const xRanges = interiorRects
        .map(r => ({ start: Math.max(r.x, wStart), end: Math.min(r.x + r.w, wEnd) }))
        .filter(r => r.end - r.start > EPS)
        .sort((a, b) => a.start - b.start);
      if (xRanges.length === 0) continue;

      const merged = [{ ...xRanges[0] }];
      for (let i = 1; i < xRanges.length; i++) {
        const prev = merged[merged.length - 1];
        if (xRanges[i].start <= prev.end + EPS) {
          prev.end = Math.max(prev.end, xRanges[i].end);
        } else {
          merged.push({ ...xRanges[i] });
        }
      }
      for (const range of merged) {
        barriers.push({ kind: 'H', pos: y, start: range.start, end: range.end, wallId: w.id });
      }
    }
  }

  return barriers;
}

// ─── Context construction ───

/**
 * Build a coordinate-compressed flood-fill context for a room with barriers.
 */
export function buildFloodFillContext(room: ResolvedRoom, barriers: Barrier[]): FloodFillContext {
  const rects = room.rects;

  // Coordinate compression: collect all rect boundary coordinates
  const xSet = new Set<number>();
  const ySet = new Set<number>();
  for (const r of rects) {
    xSet.add(r.x);
    xSet.add(r.x + r.w);
    ySet.add(r.y);
    ySet.add(r.y + r.h);
  }

  for (const b of barriers) {
    if (b.kind === 'V') {
      xSet.add(b.pos);
      ySet.add(b.start);
      ySet.add(b.end);
    } else {
      ySet.add(b.pos);
      xSet.add(b.start);
      xSet.add(b.end);
    }
  }

  const xs = [...xSet].sort((a, b) => a - b);
  const ys = [...ySet].sort((a, b) => a - b);

  // Helper: check if a point is inside any of the room's component rects
  const pointInRoom = (px: number, py: number): boolean =>
    rects.some(r => px > r.x + EPS && px < r.x + r.w - EPS && py > r.y + EPS && py < r.y + r.h - EPS);

  // Build cell grid
  const cellIdx = new Map<string, number>();
  const cellAreas: number[] = [];
  let cellCount = 0;

  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cy = (ys[j] + ys[j + 1]) / 2;
      if (pointInRoom(cx, cy)) {
        cellIdx.set(`${i},${j}`, cellCount);
        cellAreas.push((xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]));
        cellCount++;
      }
    }
  }

  // Barrier blocking helpers
  const blockingV = (x: number, segY0: number, segY1: number): number[] =>
    barriers.reduce<number[]>((acc, b, idx) => {
      if (b.kind === 'V' && Math.abs(b.pos - x) < EPS && b.start <= segY0 + EPS && b.end >= segY1 - EPS) acc.push(idx);
      return acc;
    }, []);

  const blockingH = (y: number, segX0: number, segX1: number): number[] =>
    barriers.reduce<number[]>((acc, b, idx) => {
      if (b.kind === 'H' && Math.abs(b.pos - y) < EPS && b.start <= segX0 + EPS && b.end >= segX1 - EPS) acc.push(idx);
      return acc;
    }, []);

  const isBlockedV = (x: number, segY0: number, segY1: number): boolean =>
    blockingV(x, segY0, segY1).length > 0;

  const isBlockedH = (y: number, segX0: number, segX1: number): boolean =>
    blockingH(y, segX0, segX1).length > 0;

  // Build adjacency
  const adj: number[][] = Array.from({ length: cellCount }, () => []);

  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const a = cellIdx.get(`${i},${j}`);
      if (a === undefined) continue;

      const right = cellIdx.get(`${i + 1},${j}`);
      if (right !== undefined && !isBlockedV(xs[i + 1], ys[j], ys[j + 1])) {
        adj[a].push(right);
        adj[right].push(a);
      }

      const up = cellIdx.get(`${i},${j + 1}`);
      if (up !== undefined && !isBlockedH(ys[j + 1], xs[i], xs[i + 1])) {
        adj[a].push(up);
        adj[up].push(a);
      }
    }
  }

  return { roomRect: room.boundingRect, xs, ys, cellIdx, cellAreas, cellCount, adj, barriers, blockingV, blockingH };
}

// ─── Flood fill ───

/**
 * BFS flood fill from seed points (in mm coordinates).
 * Returns a visited array (true = reached).
 */
export function floodFill(ctx: FloodFillContext, seedsMm: { x: number; y: number }[]): boolean[] {
  const visited = new Array(ctx.cellCount).fill(false);
  const queue: number[] = [];

  for (const s of seedsMm) {
    const cellId = mapPointToCell(ctx, s);
    if (cellId !== null && !visited[cellId]) {
      visited[cellId] = true;
      queue.push(cellId);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    for (const v of ctx.adj[u]) {
      if (!visited[v]) {
        visited[v] = true;
        queue.push(v);
      }
    }
  }

  return visited;
}

/**
 * Map a point (mm) to a cell index. Returns null if outside any cell.
 */
export function mapPointToCell(ctx: FloodFillContext, p: { x: number; y: number }): number | null {
  const i = upperBound(ctx.xs, p.x) - 1;
  const j = upperBound(ctx.ys, p.y) - 1;
  if (i < 0 || j < 0) return null;
  const idx = ctx.cellIdx.get(`${i},${j}`);
  return idx ?? null;
}

// ─── Region summary ───

/**
 * Summarize a set of reached cells: bounding rect, center, area.
 */
export function summarizeRegion(ctx: FloodFillContext, visited: boolean[], reachedValue: boolean): RegionSummary | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let areaMm2 = 0;
  let count = 0;
  const reachedCells: number[] = [];

  let cellId = 0;
  for (let i = 0; i < ctx.xs.length - 1; i++) {
    for (let j = 0; j < ctx.ys.length - 1; j++) {
      const idx = ctx.cellIdx.get(`${i},${j}`);
      if (idx === undefined) continue;
      if (visited[idx] === reachedValue) {
        minX = Math.min(minX, ctx.xs[i]);
        minY = Math.min(minY, ctx.ys[j]);
        maxX = Math.max(maxX, ctx.xs[i + 1]);
        maxY = Math.max(maxY, ctx.ys[j + 1]);
        areaMm2 += ctx.cellAreas[idx];
        reachedCells.push(idx);
        count++;
      }
    }
  }

  if (count === 0) return null;

  return {
    bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    areaMm2,
    cellCount: count,
    reachedCells,
  };
}

/**
 * Find barrier wall IDs that separate visited from unvisited cells.
 */
export function findBoundaryBarrierIds(ctx: FloodFillContext, visited: boolean[]): string[] {
  const boundaryBarrierIdxs = new Set<number>();

  for (let i = 0; i < ctx.xs.length - 1; i++) {
    for (let j = 0; j < ctx.ys.length - 1; j++) {
      const a = ctx.cellIdx.get(`${i},${j}`);
      if (a === undefined) continue;

      const right = ctx.cellIdx.get(`${i + 1},${j}`);
      if (right !== undefined && visited[a] !== visited[right]) {
        for (const idx of ctx.blockingV(ctx.xs[i + 1], ctx.ys[j], ctx.ys[j + 1])) boundaryBarrierIdxs.add(idx);
      }

      const up = ctx.cellIdx.get(`${i},${j + 1}`);
      if (up !== undefined && visited[a] !== visited[up]) {
        for (const idx of ctx.blockingH(ctx.ys[j + 1], ctx.xs[i], ctx.xs[i + 1])) boundaryBarrierIdxs.add(idx);
      }
    }
  }

  return [...new Set([...boundaryBarrierIdxs].map(idx => ctx.barriers[idx].wallId))].sort();
}

// ─── Helpers ───

function upperBound(arr: number[], val: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= val) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
