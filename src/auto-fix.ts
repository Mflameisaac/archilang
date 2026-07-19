/**
 * Rule-based auto-fix for validation issues.
 * Operates on YAML text (string manipulation) to preserve formatting.
 */

import { parseArchilang } from './parser.js';
import { resolve as resolveModel } from './resolver.js';
import { validateBuilding, ValidationIssue } from './validator.js';
import { BuildingModel } from './types.js';

export interface FixResult {
  applied: boolean;
  description: string;
  code: string;
}

/**
 * Attempt to fix GRID_MISALIGNMENT by snapping wall endpoints to nearest grid.
 */
export function fixGridMisalignment(
  yamlText: string,
  issue: ValidationIssue,
  model: BuildingModel,
): { yamlText: string; fix: FixResult } {
  const wallId = issue.wallId;
  if (!wallId) return { yamlText, fix: { applied: false, description: 'No wallId', code: issue.code } };

  const wall = model.walls.find(w => w.id === wallId);
  if (!wall || wall.hasOffset) {
    return { yamlText, fix: { applied: false, description: 'Wall has offset or not found', code: issue.code } };
  }

  const mod = model.moduleSize;
  const maxSnapDist = mod / 2; // 455mm for 910mm module — snap to nearest grid within half a module

  const snap = (c: number): number | null => {
    const snapped = Math.round(c / mod) * mod;
    return Math.abs(snapped - c) <= maxSnapDist ? snapped : null;
  };

  // Find the wall segment in YAML by its id and replace coordinate values
  // We look for the pattern: - id: <wallId> ... from: { x: <val>, y: <val> } ... to: { x: <val>, y: <val> }
  const replacements: Array<{ field: string; axis: string; original: number; snapped: number }> = [];
  for (const [original, field, axis] of [
    [wall.x1, 'from', 'x'], [wall.y1, 'from', 'y'],
    [wall.x2, 'to', 'x'], [wall.y2, 'to', 'y'],
  ] as Array<[number, string, string]>) {
    const snapped = snap(original);
    if (snapped !== null && snapped !== original) {
      replacements.push({ field, axis, original, snapped });
    }
  }

  let modified = yamlText;
  const changes: string[] = [];

  // Find the wall segment block by id
  const wallIdIdx = modified.indexOf(`id: ${wallId}`);
  if (wallIdIdx === -1) return { yamlText, fix: { applied: false, description: 'Wall id not found in YAML', code: issue.code } };

  // Find the end of this segment (next segment starting with "- id:" or end of segments section)
  const afterId = modified.slice(wallIdIdx);
  const nextSegMatch = afterId.match(/\n\s+- id:/);
  const segEnd = nextSegMatch?.index ?? afterId.length;
  let segBlock = afterId.slice(0, segEnd);

  for (const { field, axis, original, snapped } of replacements) {
    // In the segment block, find "from:" or "to:" then the axis value
    const fieldIdx = segBlock.indexOf(`${field}:`);
    if (fieldIdx === -1) continue;

    const afterField = segBlock.slice(fieldIdx);
    // Match "x: 2500" or "y: 0" pattern
    const pattern = new RegExp(`(${axis}:\\s*)${original}(?=\\s|,|\\}|$)`);
    const match = afterField.match(pattern);
    if (match) {
      const replaced = match[0].replace(String(original), String(snapped));
      const absFieldIdx = fieldIdx + (match.index ?? 0);
      segBlock = segBlock.slice(0, absFieldIdx) + replaced + segBlock.slice(absFieldIdx + match[0].length);
      changes.push(`${original}→${snapped}`);
    }
  }

  modified = modified.slice(0, wallIdIdx) + segBlock + modified.slice(wallIdIdx + segEnd);

  if (changes.length === 0) {
    return { yamlText, fix: { applied: false, description: 'No coordinates to snap (snap distance too large)', code: issue.code } };
  }

  return {
    yamlText: modified,
    fix: { applied: true, description: `Snapped wall "${wallId}" to grid: ${changes.join(', ')}`, code: issue.code },
  };
}

/**
 * Attempt to fix ROOM_WITHOUT_DOOR by adding a door to a shared wall.
 */
/**
 * Rooms that exist to be walked through. A repaired door should open onto one
 * of these where possible: connecting a bedroom to the hallway is what an
 * architect would draw, whereas connecting it to the neighbouring bedroom is
 * merely reachable.
 */
const CIRCULATION = /^(corridor|hall|hallway|passage|lobby|landing|foyer|entrance|廊下|玄関)$/i;

function isCirculation(model: BuildingModel, roomId: string): boolean {
  const room = model.rooms.find(r => r.id === roomId);
  return CIRCULATION.test(roomId) || (room ? CIRCULATION.test(room.type) : false);
}

/**
 * Remove an opening that could not be resolved.
 *
 * Generated plans frequently place a door between two rooms that do not share
 * a wall. The opening is unusable, and while it remains the room it was meant
 * to serve stays unreachable. Deleting it lets the next pass of the solve loop
 * see a plain ROOM_WITHOUT_DOOR and connect the room somewhere it can actually
 * reach — repairing the plan in two steps rather than rejecting it.
 */
export function fixSkippedOpening(
  yamlText: string,
  issue: ValidationIssue,
): { yamlText: string; fix: FixResult } {
  const openingId = issue.openingId;
  if (!openingId) {
    return { yamlText, fix: { applied: false, description: 'No openingId', code: issue.code } };
  }

  const lines = yamlText.split('\n');

  // Locate the list item introducing this id. Both `- id: x` and a `- ` line
  // followed by `id: x` are valid YAML, so match the id then walk back to the
  // nearest list marker.
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (new RegExp(`^\\s*-?\\s*(?:\\{\\s*)?id:\\s*["']?${openingId}["']?\\s*[,}]?\\s*$`).test(lines[i])
        || new RegExp(`^\\s*-\\s*\\{.*\\bid:\\s*["']?${openingId}["']?\\b`).test(lines[i])) {
      startIdx = i;
      while (startIdx > 0 && !/^\s*-/.test(lines[startIdx])) startIdx--;
      break;
    }
  }
  if (startIdx === -1) {
    return {
      yamlText,
      fix: { applied: false, description: `Opening "${openingId}" not found in YAML`, code: issue.code },
    };
  }

  // The item runs until the next sibling list marker at the same indent, or
  // until a line dedents out of the list entirely.
  const indent = lines[startIdx].search(/\S/);
  let endIdx = startIdx + 1;
  while (endIdx < lines.length) {
    const line = lines[endIdx];
    if (line.trim() === '' || line.trim().startsWith('#')) { endIdx++; continue; }
    const ind = line.search(/\S/);
    if (ind < indent) break;
    if (ind === indent && /^\s*-/.test(line)) break;
    endIdx++;
  }

  lines.splice(startIdx, endIdx - startIdx);
  return {
    yamlText: lines.join('\n'),
    fix: {
      applied: true,
      description: `Removed unresolvable opening "${openingId}" (${issue.message.replace(/^Opening "[^"]*" was skipped: /, '')})`,
      code: issue.code,
    },
  };
}

export function fixRoomWithoutDoor(
  yamlText: string,
  issue: ValidationIssue,
  model: BuildingModel,
): { yamlText: string; fix: FixResult } {
  const roomId = issue.roomIds?.[0];
  if (!roomId) return { yamlText, fix: { applied: false, description: 'No roomId', code: issue.code } };

  // Find a shared wall with another room
  const sharedWall = model.walls
    .filter(w => w.rooms.includes(roomId) && w.rooms.length >= 2)
    .sort((a, b) => {
      // Prefer a wall shared with circulation space — a bedroom should open
      // onto the corridor rather than into the next bedroom.
      const circA = a.rooms.some(r => r !== roomId && isCirculation(model, r));
      const circB = b.rooms.some(r => r !== roomId && isCirculation(model, r));
      if (circA !== circB) return circA ? -1 : 1;
      // Then internal walls, then longest wall
      if (a.isExternal !== b.isExternal) return a.isExternal ? 1 : -1;
      const lenA = Math.abs(a.x2 - a.x1) + Math.abs(a.y2 - a.y1);
      const lenB = Math.abs(b.x2 - b.x1) + Math.abs(b.y2 - b.y1);
      return lenB - lenA;
    })[0];

  if (!sharedWall) {
    return { yamlText, fix: { applied: false, description: `No shared wall found for room "${roomId}"`, code: issue.code } };
  }

  const neighbor = sharedWall.rooms.find(r => r !== roomId)!;
  const doorId = `D_auto_${roomId}`;

  // Check if there are existing openings on this wall
  const existingOnWall = model.openings.filter(o => o.wallId === sharedWall.id);
  if (existingOnWall.length > 0) {
    return { yamlText, fix: { applied: false, description: `Wall "${sharedWall.id}" already has openings`, code: issue.code } };
  }

  // Add door to YAML openings section
  const doorYaml = `
    - id: ${doorId}
      type: WD
      style: 片開き
      connects: [${roomId}, ${neighbor}]
      position: center
      size: { w: 800, h: 2000 }`;

  // Find the openings section and append
  let workingYaml = yamlText;
  // Normalize flow-style empty openings: "openings: []" → "openings:"
  workingYaml = workingYaml.replace(/openings:\s*\[\s*\]/, 'openings:');

  const openingsIdx = workingYaml.indexOf('openings:');
  if (openingsIdx === -1) {
    return { yamlText, fix: { applied: false, description: 'No openings section found in YAML', code: issue.code } };
  }

  // Find the end of the openings list (next top-level key or end of geometry block)
  const afterOpenings = workingYaml.slice(openingsIdx);
  const nextSectionMatch = afterOpenings.match(/\n\s{0,2}\w+:/);
  let insertIdx: number;
  if (nextSectionMatch && nextSectionMatch.index !== undefined) {
    insertIdx = openingsIdx + nextSectionMatch.index;
  } else {
    insertIdx = workingYaml.length;
  }

  const modified = workingYaml.slice(0, insertIdx) + doorYaml + '\n' + workingYaml.slice(insertIdx);

  return {
    yamlText: modified,
    fix: {
      applied: true,
      description: `Added door "${doorId}" connecting "${roomId}" to "${neighbor}" on wall "${sharedWall.id}"`,
      code: issue.code,
    },
  };
}

/**
 * Insert a door between two rooms that share the given wall.
 * Shared by the ROOM_WITHOUT_DOOR and UNREACHABLE_ROOM rules.
 */
function insertDoor(
  yamlText: string,
  doorId: string,
  roomA: string,
  roomB: string,
  wallId: string,
  code: string,
): { yamlText: string; fix: FixResult } {
  const doorYaml = `
    - id: ${doorId}
      type: WD
      style: 片開き
      connects: [${roomA}, ${roomB}]
      position: center
      size: { w: 800, h: 2000 }`;

  let workingYaml = yamlText.replace(/openings:\s*\[\s*\]/, 'openings:');
  const openingsIdx = workingYaml.indexOf('openings:');
  if (openingsIdx === -1) {
    return { yamlText, fix: { applied: false, description: 'No openings section found in YAML', code } };
  }

  const afterOpenings = workingYaml.slice(openingsIdx);
  const nextSectionMatch = afterOpenings.match(/\n\s{0,2}\w+:/);
  const insertIdx = nextSectionMatch?.index !== undefined
    ? openingsIdx + nextSectionMatch.index
    : workingYaml.length;

  return {
    yamlText: workingYaml.slice(0, insertIdx) + doorYaml + '\n' + workingYaml.slice(insertIdx),
    fix: {
      applied: true,
      description: `Added door "${doorId}" connecting "${roomA}" to "${roomB}" on wall "${wallId}"`,
      code,
    },
  };
}

/**
 * The set of rooms reachable on foot from outside: seeded with every room
 * holding an external door, then walked through internal door connections.
 */
function reachableRooms(model: BuildingModel): Set<string> {
  const reachable = new Set<string>();
  const queue: string[] = [];

  for (const o of model.openings) {
    const isDoor = o.type === 'WD' || o.type === 'AD';
    if (isDoor && o.isExternal) {
      for (const w of model.walls.filter(w => w.id === o.wallId)) {
        for (const r of w.rooms) if (!reachable.has(r)) { reachable.add(r); queue.push(r); }
      }
    }
  }

  while (queue.length) {
    const room = queue.shift()!;
    for (const o of model.openings) {
      const pair = o.connectedRooms;
      if (!pair) continue;
      if (pair[0] === room && !reachable.has(pair[1])) { reachable.add(pair[1]); queue.push(pair[1]); }
      if (pair[1] === room && !reachable.has(pair[0])) { reachable.add(pair[0]); queue.push(pair[0]); }
    }
  }

  return reachable;
}

/**
 * Attach an unreachable room to the reachable part of the plan.
 *
 * A room can hold a door and still be cut off — two bedrooms opening onto each
 * other but onto nothing else form an island, which ROOM_WITHOUT_DOOR does not
 * catch because neither room is doorless. This finds a wall the room shares
 * with somewhere already reachable and puts a door in it, which also rescues
 * anything stranded behind it.
 */
export function fixUnreachableRoom(
  yamlText: string,
  issue: ValidationIssue,
  model: BuildingModel,
): { yamlText: string; fix: FixResult } {
  const roomId = issue.roomIds?.[0];
  if (!roomId) return { yamlText, fix: { applied: false, description: 'No roomId', code: issue.code } };

  const reachable = reachableRooms(model);
  if (reachable.has(roomId)) {
    return { yamlText, fix: { applied: false, description: `Room "${roomId}" already reachable`, code: issue.code } };
  }

  const candidateWalls = model.walls
    .filter(w => w.rooms.includes(roomId) && w.rooms.some(r => r !== roomId && reachable.has(r)))
    .sort((a, b) => {
      // Prefer opening onto circulation, then the longest wall for a sensible door position.
      const circA = a.rooms.some(r => r !== roomId && isCirculation(model, r));
      const circB = b.rooms.some(r => r !== roomId && isCirculation(model, r));
      if (circA !== circB) return circA ? -1 : 1;
      const lenA = Math.abs(a.x2 - a.x1) + Math.abs(a.y2 - a.y1);
      const lenB = Math.abs(b.x2 - b.x1) + Math.abs(b.y2 - b.y1);
      return lenB - lenA;
    });

  const wall = candidateWalls.find(w => !model.openings.some(o => o.wallId === w.id));
  if (!wall) {
    return {
      yamlText,
      fix: {
        applied: false,
        description: candidateWalls.length
          ? `Room "${roomId}" adjoins reachable space but every shared wall already has an opening`
          : `Room "${roomId}" shares no wall with any reachable room`,
        code: issue.code,
      },
    };
  }

  const neighbor = wall.rooms.find(r => r !== roomId && reachable.has(r))!;
  return insertDoor(yamlText, `D_auto_${roomId}`, roomId, neighbor, wall.id, issue.code);
}

/**
 * Apply all auto-fixable rules to the given YAML.
 */
export function applyAutoFixes(
  yamlText: string,
  issues: ValidationIssue[],
  model: BuildingModel,
): { yamlText: string; fixes: FixResult[] } {
  const fixes: FixResult[] = [];
  let current = yamlText;

  // Remove unresolvable openings first. This deliberately leaves the affected
  // room doorless so the ROOM_WITHOUT_DOOR rule — on this pass or the next —
  // reconnects it to a room it genuinely adjoins.
  for (const issue of issues.filter(i => i.code === 'SKIPPED_OPENING')) {
    const result = fixSkippedOpening(current, issue);
    current = result.yamlText;
    fixes.push(result.fix);
  }

  // Apply GRID_MISALIGNMENT fixes first (doesn't change structure)
  for (const issue of issues.filter(i => i.code === 'GRID_MISALIGNMENT')) {
    const result = fixGridMisalignment(current, issue, model);
    current = result.yamlText;
    fixes.push(result.fix);
  }

  // Apply ROOM_WITHOUT_DOOR fixes (adds openings)
  for (const issue of issues.filter(i => i.code === 'ROOM_WITHOUT_DOOR')) {
    // Re-parse after previous fixes to get updated model
    try {
      const spec = parseArchilang(current);
      const updatedModel = resolveModel(spec);
      const result = fixRoomWithoutDoor(current, issue, updatedModel);
      current = result.yamlText;
      fixes.push(result.fix);
    } catch {
      fixes.push({ applied: false, description: `Failed to re-parse after previous fix`, code: issue.code });
    }
  }

  // Finally, attach any room still cut off from the entrance. This runs last
  // because the rules above change connectivity, so reachability is only
  // meaningful once they have been applied.
  for (const issue of issues.filter(i => i.code === 'UNREACHABLE_ROOM')) {
    try {
      const updatedModel = resolveModel(parseArchilang(current));
      if (!validateBuilding(updatedModel).issues.some(
        i => i.code === 'UNREACHABLE_ROOM' && i.roomIds?.[0] === issue.roomIds?.[0])) {
        continue; // an earlier fix already rescued it
      }
      const result = fixUnreachableRoom(current, issue, updatedModel);
      current = result.yamlText;
      fixes.push(result.fix);
    } catch {
      fixes.push({ applied: false, description: 'Failed to re-parse after previous fix', code: issue.code });
    }
  }

  return { yamlText: current, fixes };
}
