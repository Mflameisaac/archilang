import { BuildingModel, WallEdge, ResolvedOpening } from '../types.js';
import { SvgRenderConfig, mmToSvg, mmToSvgLength, svgGroup } from '../svg-utils.js';

interface WallChain {
  points: { x: number; y: number }[];
  wallIds: string[];
  closed: boolean;
  thickness: number;
  isExternal: boolean;
  /** true when this chain was produced by splitting at an opening */
  splitByOpening: boolean;
}

export function renderWalls(model: BuildingModel, config: SvgRenderConfig): string {
  const openingsByWall = new Map<string, ResolvedOpening[]>();
  for (const o of model.openings) {
    const list = openingsByWall.get(o.wallId) || [];
    list.push(o);
    openingsByWall.set(o.wallId, list);
  }

  // Group walls by isExternal + thickness to prevent mismatched chains
  const wallGroups = new Map<string, WallEdge[]>();
  for (const w of model.walls) {
    const key = `${w.isExternal}:${w.thickness}`;
    const group = wallGroups.get(key) || [];
    group.push(w);
    wallGroups.set(key, group);
  }

  const elements: string[] = [];

  // Sort groups: internal first, then external (external draws on top)
  const sortedGroups = [...wallGroups.entries()].sort(([a], [b]) => {
    const aExt = a.startsWith('true');
    const bExt = b.startsWith('true');
    return aExt === bExt ? 0 : aExt ? 1 : -1;
  });

  for (const [, group] of sortedGroups) {
    const chains = buildWallChains(group);
    const subChains = splitChainsAtOpenings(chains, openingsByWall);
    elements.push(...renderChains(subChains, config));
  }

  return svgGroup('walls', elements);
}

/**
 * Build connected wall chains from a list of walls sharing the same thickness.
 * Walls are connected when they share an endpoint (exact match — grid-aligned).
 */
function buildWallChains(walls: WallEdge[]): WallChain[] {
  // Normalize each wall: start = min coord end, end = max coord end
  const normalized = walls.map(w => {
    const isV = w.x1 === w.x2;
    if (isV) {
      const minY = Math.min(w.y1, w.y2);
      const maxY = Math.max(w.y1, w.y2);
      return { ...w, x1: w.x1, y1: minY, x2: w.x2, y2: maxY };
    } else {
      const minX = Math.min(w.x1, w.x2);
      const maxX = Math.max(w.x1, w.x2);
      return { ...w, x1: minX, y1: w.y1, x2: maxX, y2: w.y2 };
    }
  });

  // Build adjacency: endpoint → list of { wallIndex, whichEnd }
  const ptKey = (x: number, y: number) => `${x},${y}`;
  const adj = new Map<string, { idx: number; end: 'start' | 'end' }[]>();

  for (let i = 0; i < normalized.length; i++) {
    const w = normalized[i];
    for (const end of ['start', 'end'] as const) {
      const x = end === 'start' ? w.x1 : w.x2;
      const y = end === 'start' ? w.y1 : w.y2;
      const key = ptKey(x, y);
      const arr = adj.get(key) || [];
      arr.push({ idx: i, end });
      adj.set(key, arr);
    }
  }

  const visited = new Set<number>();
  const chains: WallChain[] = [];

  for (let startIdx = 0; startIdx < normalized.length; startIdx++) {
    if (visited.has(startIdx)) continue;

    // BFS to find connected component (use index pointer instead of shift)
    const component: number[] = [];
    const queue: number[] = [startIdx];
    let qHead = 0;
    visited.add(startIdx);
    while (qHead < queue.length) {
      const ci = queue[qHead++];
      component.push(ci);
      const w = normalized[ci];
      for (const end of ['start', 'end'] as const) {
        const x = end === 'start' ? w.x1 : w.x2;
        const y = end === 'start' ? w.y1 : w.y2;
        const neighbors = adj.get(ptKey(x, y)) || [];
        for (const n of neighbors) {
          if (!visited.has(n.idx)) {
            visited.add(n.idx);
            queue.push(n.idx);
          }
        }
      }
    }

    // Order the component into chain(s)
    const ordered = orderComponent(component, normalized, adj, ptKey);
    chains.push(...ordered);
  }

  return chains;
}

function orderComponent(
  component: number[],
  walls: WallEdge[],
  adj: Map<string, { idx: number; end: 'start' | 'end' }[]>,
  ptKey: (x: number, y: number) => string,
): WallChain[] {
  if (component.length === 1) {
    const w = walls[component[0]];
    return [{
      points: [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }],
      wallIds: [w.id],
      closed: false,
      thickness: w.thickness,
      isExternal: w.isExternal,
      splitByOpening: false,
    }];
  }

  const compSet = new Set(component);

  // Build neighbor map within component: wallIdx → neighbors at start/end
  const neighborAt = (idx: number, end: 'start' | 'end'): number[] => {
    const w = walls[idx];
    const x = end === 'start' ? w.x1 : w.x2;
    const y = end === 'start' ? w.y1 : w.y2;
    const entries = adj.get(ptKey(x, y)) || [];
    return entries.filter(e => e.idx !== idx && compSet.has(e.idx)).map(e => e.idx);
  };

  // Find degree of each wall endpoint within the component
  const degree = (idx: number, end: 'start' | 'end') => neighborAt(idx, end).length;

  // Find a wall with a free endpoint (degree-1) to start from
  let chainStart = -1;
  let chainStartEnd: 'start' | 'end' = 'start';
  for (const idx of component) {
    if (degree(idx, 'start') === 0) {
      chainStart = idx;
      chainStartEnd = 'start';
      break;
    }
    if (degree(idx, 'end') === 0) {
      chainStart = idx;
      chainStartEnd = 'end';
      break;
    }
  }

  const isClosed = chainStart === -1;
  if (isClosed) {
    chainStart = component[0];
    chainStartEnd = 'start';
  }

  // Trace the chain
  const traced = new Set<number>();
  const chains: WallChain[] = [];

  const traceChain = (startIdx: number, startFromEnd: 'start' | 'end'): WallChain => {
    const points: { x: number; y: number }[] = [];
    const wallIds: string[] = [];
    traced.add(startIdx);

    const w0 = walls[startIdx];
    if (startFromEnd === 'end') {
      points.push({ x: w0.x2, y: w0.y2 });
      points.push({ x: w0.x1, y: w0.y1 });
    } else {
      points.push({ x: w0.x1, y: w0.y1 });
      points.push({ x: w0.x2, y: w0.y2 });
    }
    wallIds.push(w0.id);

    // Follow the chain from the last point
    let lastPt = points[points.length - 1];
    while (true) {
      const key = ptKey(lastPt.x, lastPt.y);
      const candidates = (adj.get(key) || []).filter(e => !traced.has(e.idx) && compSet.has(e.idx));

      if (candidates.length === 0) break;

      // Prefer collinear continuation at junctions
      const prevPt = points[points.length - 2];
      const prevIsV = prevPt.x === lastPt.x;
      let best = candidates[0];
      for (const c of candidates) {
        const cw = walls[c.idx];
        const nextPt = c.end === 'start'
          ? { x: cw.x2, y: cw.y2 }
          : { x: cw.x1, y: cw.y1 };
        const nextIsV = lastPt.x === nextPt.x;
        if (nextIsV === prevIsV) {
          best = c;
          break;
        }
      }

      traced.add(best.idx);
      const bw = walls[best.idx];
      wallIds.push(bw.id);
      if (best.end === 'start') {
        points.push({ x: bw.x2, y: bw.y2 });
      } else {
        points.push({ x: bw.x1, y: bw.y1 });
      }
      lastPt = points[points.length - 1];
    }

    // Always normalize closed loop: remove duplicate closing point
    const first = points[0];
    const last = points[points.length - 1];
    const closed = first.x === last.x && first.y === last.y && points.length > 2;
    if (closed) {
      points.pop();
    }

    return { points, wallIds, closed, thickness: w0.thickness, isExternal: w0.isExternal, splitByOpening: false };
  };

  chains.push(traceChain(chainStart, chainStartEnd));

  // Handle any untraced walls (branches)
  for (const idx of component) {
    if (!traced.has(idx)) {
      const sNeighbors = neighborAt(idx, 'start');
      const startConnected = sNeighbors.some(n => traced.has(n));
      chains.push(traceChain(idx, startConnected ? 'end' : 'start'));
    }
  }

  return chains;
}

/**
 * Split chains at opening gaps to produce sub-chains.
 * Careful to maintain point continuity and handle closed loops correctly.
 */
function splitChainsAtOpenings(
  chains: WallChain[],
  openingsByWall: Map<string, ResolvedOpening[]>,
): WallChain[] {
  const result: WallChain[] = [];

  for (const chain of chains) {
    const hasOpenings = chain.wallIds.some(id => (openingsByWall.get(id) || []).length > 0);
    if (!hasOpenings) {
      result.push(chain);
      continue;
    }

    // Process each wall segment into ordered solid segments
    // Each segment is an array of points that form a continuous sub-path
    const subChains: { x: number; y: number }[][] = [];
    let currentSub: { x: number; y: number }[] = [];

    const numWalls = chain.wallIds.length;
    for (let i = 0; i < numWalls; i++) {
      const wallId = chain.wallIds[i];
      const openings = openingsByWall.get(wallId) || [];
      const p1 = chain.points[i];
      const p2 = chain.closed
        ? chain.points[(i + 1) % chain.points.length]
        : chain.points[i + 1];
      if (!p2) continue;

      if (openings.length === 0) {
        // No openings — check continuity before appending
        if (currentSub.length === 0) {
          currentSub.push(p1, p2);
        } else {
          const lastPt = currentSub[currentSub.length - 1];
          if (lastPt.x === p1.x && lastPt.y === p1.y) {
            // Continuous — extend
            currentSub.push(p2);
          } else {
            // Discontinuous — start new sub-chain
            if (currentSub.length >= 2) subChains.push(currentSub);
            currentSub = [p1, p2];
          }
        }
      } else {
        // Wall has openings — compute solid ranges
        const isV = p1.x === p2.x;
        const wallStart = isV ? Math.min(p1.y, p2.y) : Math.min(p1.x, p2.x);
        const wallEnd = isV ? Math.max(p1.y, p2.y) : Math.max(p1.x, p2.x);
        const reversed = isV ? (p1.y > p2.y) : (p1.x > p2.x);

        const gaps: { start: number; end: number }[] = [];
        for (const o of openings) {
          const center = isV ? o.cy : o.cx;
          const halfW = o.w / 2;
          const gs = Math.max(center - halfW, wallStart);
          const ge = Math.min(center + halfW, wallEnd);
          if (gs < ge) gaps.push({ start: gs, end: ge });
        }
        gaps.sort((a, b) => a.start - b.start);

        const solidRanges: { start: number; end: number }[] = [];
        let cursor = wallStart;
        for (const gap of gaps) {
          if (gap.start > cursor) {
            solidRanges.push({ start: cursor, end: gap.start });
          }
          cursor = Math.max(cursor, gap.end);
        }
        if (cursor < wallEnd) {
          solidRanges.push({ start: cursor, end: wallEnd });
        }

        if (reversed) solidRanges.reverse();

        // No solid ranges (fully open wall) — break the chain
        if (solidRanges.length === 0) {
          if (currentSub.length >= 2) subChains.push(currentSub);
          currentSub = [];
          continue;
        }

        for (let si = 0; si < solidRanges.length; si++) {
          const range = solidRanges[si];
          const segP1 = isV
            ? { x: p1.x, y: reversed ? range.end : range.start }
            : { x: reversed ? range.end : range.start, y: p1.y };
          const segP2 = isV
            ? { x: p1.x, y: reversed ? range.start : range.end }
            : { x: reversed ? range.start : range.end, y: p1.y };

          if (si === 0) {
            // First solid segment — check continuity with current sub-chain
            if (currentSub.length > 0) {
              const lastPt = currentSub[currentSub.length - 1];
              if (lastPt.x === segP1.x && lastPt.y === segP1.y) {
                currentSub.push(segP2);
              } else {
                // Gap (opening at wall start or discontinuity)
                if (currentSub.length >= 2) subChains.push(currentSub);
                currentSub = [segP1, segP2];
              }
            } else {
              currentSub = [segP1, segP2];
            }
          } else {
            // After a gap within this wall — always start new sub-chain
            if (currentSub.length >= 2) subChains.push(currentSub);
            currentSub = [segP1, segP2];
          }
        }
      }
    }

    // Flush remaining sub-chain
    if (currentSub.length >= 2) subChains.push(currentSub);

    // For closed chains: try to merge first and last sub-chains if they connect
    if (chain.closed && subChains.length >= 2) {
      const first = subChains[0];
      const last = subChains[subChains.length - 1];
      const lastEnd = last[last.length - 1];
      const firstStart = first[0];
      if (lastEnd.x === firstStart.x && lastEnd.y === firstStart.y) {
        // Merge: prepend last to first (removing duplicate junction point)
        const merged = [...last, ...first.slice(1)];
        subChains[0] = merged;
        subChains.pop();
      }
    }

    // Convert to WallChain objects
    for (const pts of subChains) {
      result.push({
        points: pts,
        wallIds: chain.wallIds,
        closed: false, // split chains are never closed
        thickness: chain.thickness,
        isExternal: chain.isExternal,
        splitByOpening: true,
      });
    }
  }

  return result;
}

/**
 * Render chains as SVG paths with stroke-linejoin="miter".
 * Two-pass: outline (dark border) then fill (wall color).
 */
function renderChains(chains: WallChain[], config: SvgRenderConfig): string[] {
  const elements: string[] = [];

  // Pre-compute paths to avoid duplicate work
  const paths = chains.map(chain => chainToPath(chain, config));

  // Pass 1: Outline (slightly wider stroke in dark color)
  for (let i = 0; i < chains.length; i++) {
    const chain = chains[i];
    const outlineWidth = chain.isExternal ? 1.5 : 1;
    const strokeW = mmToSvgLength(chain.thickness, config) + outlineWidth * 2;
    // Use butt caps for opening-split chains to avoid encroaching into opening gaps
    const cap = chain.closed ? 'butt' : (chain.splitByOpening ? 'butt' : 'square');
    elements.push(`<path d="${paths[i]}" fill="none" stroke="#333" stroke-width="${strokeW.toFixed(2)}" stroke-linejoin="miter" stroke-miterlimit="10" stroke-linecap="${cap}"/>`);
  }

  // Pass 2: Fill (wall color on top)
  for (let i = 0; i < chains.length; i++) {
    const chain = chains[i];
    const fillColor = chain.isExternal ? '#555' : '#888';
    const strokeW = mmToSvgLength(chain.thickness, config);
    const cap = chain.closed ? 'butt' : (chain.splitByOpening ? 'butt' : 'square');
    elements.push(`<path d="${paths[i]}" fill="none" stroke="${fillColor}" stroke-width="${strokeW.toFixed(2)}" stroke-linejoin="miter" stroke-miterlimit="10" stroke-linecap="${cap}"/>`);
  }

  return elements;
}

function chainToPath(chain: WallChain, config: SvgRenderConfig): string {
  const parts: string[] = [];
  for (let i = 0; i < chain.points.length; i++) {
    const p = mmToSvg(chain.points[i].x, chain.points[i].y, config);
    if (i === 0) {
      parts.push(`M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
    } else {
      parts.push(`L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
    }
  }
  if (chain.closed) {
    parts.push('Z');
  }
  return parts.join(' ');
}
