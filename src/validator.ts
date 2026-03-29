import { BuildingModel, ResolvedOpening, ResolvedRoom, ResolvedEquipment, WallEdge, Rect } from './types.js';
import {
  findBarriersInRoom, buildFloodFillContext, floodFill,
  summarizeRegion, findBoundaryBarrierIds,
} from './flood-fill.js';

const OUTSIDE = '__outside__' as const;
const EPS = 0.5; // mm tolerance for coordinate comparisons

export type Severity = 'error' | 'warning';

export type IssueCode =
  | 'UNKNOWN_ROOM_REF'
  | 'UNREACHABLE_ROOM'
  | 'ROOM_WITHOUT_DOOR'
  | 'ISOLATED_SUBAREA'
  | 'SKIPPED_OPENING'
  | 'SUB_ROOM_WITHOUT_DOOR'
  | 'EQUIPMENT_UNKNOWN_ROOM'
  | 'EQUIPMENT_OUT_OF_BOUNDS'
  | 'EQUIPMENT_OVERLAP'
  | 'EQUIPMENT_OPENING_WALL_OVERLAP'
  | 'EQUIPMENT_DOOR_CLEARANCE_BLOCKED';

export interface ValidationIssue {
  severity: Severity;
  code: IssueCode;
  message: string;
  roomIds?: string[];
  openingId?: string;
  equipmentId?: string;
  wallId?: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  ok: boolean;
}

/** Door types that provide physical access between rooms */
function isDoor(opening: ResolvedOpening): boolean {
  return opening.type === 'WD' || opening.type === 'AD';
}

// ─── Door seeds (reused from old inline logic) ───

function findDoorSeedsInRoom(
  room: ResolvedRoom,
  openings: ResolvedOpening[],
  walls: WallEdge[],
): { x: number; y: number }[] {
  const seeds: { x: number; y: number }[] = [];

  for (const o of openings) {
    if (!isDoor(o)) continue;

    let isRelevant = false;
    if (o.connectedRooms) {
      isRelevant = o.connectedRooms.includes(room.id);
    } else {
      const wall = walls.find(w => w.id === o.wallId);
      if (wall && wall.rooms.includes(room.id)) isRelevant = true;
    }
    if (!isRelevant) continue;

    const seed = offsetInward(o.cx, o.cy, room.rects);
    if (seed) seeds.push(seed);
  }

  return seeds;
}

function offsetInward(
  cx: number, cy: number,
  rects: Rect[],
): { x: number; y: number } | null {
  const OFFSET = 1;
  for (const r of rects) {
    const x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
    if (Math.abs(cx - x0) < EPS && cy >= y0 - EPS && cy <= y1 + EPS) return { x: x0 + OFFSET, y: cy };
    if (Math.abs(cx - x1) < EPS && cy >= y0 - EPS && cy <= y1 + EPS) return { x: x1 - OFFSET, y: cy };
    if (Math.abs(cy - y0) < EPS && cx >= x0 - EPS && cx <= x1 + EPS) return { x: cx, y: y0 + OFFSET };
    if (Math.abs(cy - y1) < EPS && cx >= x0 - EPS && cx <= x1 + EPS) return { x: cx, y: y1 - OFFSET };
  }
  return { x: cx, y: cy };
}

// ─── Isolated subarea detection (now using shared flood-fill) ───

export function detectIsolatedSubareas(
  room: ResolvedRoom,
  walls: WallEdge[],
  openings: ResolvedOpening[],
): { isolated: boolean; unreachableAreaMm2: number; barrierWallIds: string[] } {
  const barriers = findBarriersInRoom(room, walls);
  if (barriers.length === 0) {
    return { isolated: false, unreachableAreaMm2: 0, barrierWallIds: [] };
  }

  const ctx = buildFloodFillContext(room, barriers);
  if (ctx.cellCount === 0) {
    return { isolated: false, unreachableAreaMm2: 0, barrierWallIds: [] };
  }

  const seeds = findDoorSeedsInRoom(room, openings, walls);
  if (seeds.length === 0) {
    return { isolated: false, unreachableAreaMm2: 0, barrierWallIds: [] };
  }

  const visited = floodFill(ctx, seeds);

  // Compute unreachable area
  const unreachable = summarizeRegion(ctx, visited, false);
  if (!unreachable || unreachable.areaMm2 === 0) {
    return { isolated: false, unreachableAreaMm2: 0, barrierWallIds: [] };
  }

  const boundaryWallIds = findBoundaryBarrierIds(ctx, visited);

  return {
    isolated: true,
    unreachableAreaMm2: unreachable.areaMm2,
    barrierWallIds: boundaryWallIds,
  };
}

// ─── Main validation ───

export function validateBuilding(model: BuildingModel): ValidationResult {
  const issues: ValidationIssue[] = [];
  const roomIds = model.rooms.map(r => r.id);
  const subRooms = model.subRooms ?? [];
  const subRoomIds = subRooms.map(s => s.id);
  const allKnownIds = new Set([...roomIds, ...subRoomIds]);

  // Check for unknown room references in resolved openings
  for (const o of model.openings) {
    if (o.connectedRooms) {
      for (const ref of o.connectedRooms) {
        if (!allKnownIds.has(ref)) {
          issues.push({
            severity: 'error',
            code: 'UNKNOWN_ROOM_REF',
            message: `Opening "${o.id}" references unknown room "${ref}"`,
            roomIds: [ref],
            openingId: o.id,
          });
        }
      }
    }
  }

  // Check openings that were skipped during resolution
  for (const s of model.skippedOpenings) {
    const code: IssueCode = s.reasonCode === 'UNKNOWN_ROOM_REF' ? 'UNKNOWN_ROOM_REF' : 'SKIPPED_OPENING';
    issues.push({
      severity: 'error',
      code,
      message: `Opening "${s.id}" was skipped: ${s.reason}`,
      openingId: s.id,
      roomIds: s.connects ? [...s.connects] : s.room ? [s.room] : undefined,
    });
  }

  // Build room-level connectivity graph
  const wallRoomMap = new Map<string, string[]>();
  for (const w of model.walls) {
    wallRoomMap.set(w.id, w.rooms);
  }

  // Map sub_room IDs to parent room IDs for connectivity
  const subRoomToParent = new Map<string, string>();
  for (const sr of subRooms) {
    subRoomToParent.set(sr.id, sr.parentRoomId);
  }

  const adj = new Map<string, Set<string>>();
  const ensure = (id: string) => {
    if (!adj.has(id)) adj.set(id, new Set());
  };

  for (const id of roomIds) ensure(id);
  for (const id of subRoomIds) ensure(id);
  ensure(OUTSIDE);

  for (const o of model.openings) {
    if (!isDoor(o)) continue;

    if (o.connectedRooms) {
      const [a, b] = o.connectedRooms;
      // Resolve sub_room refs to themselves (they are real nodes in the graph)
      if (allKnownIds.has(a) && allKnownIds.has(b)) {
        ensure(a);
        ensure(b);
        adj.get(a)!.add(b);
        adj.get(b)!.add(a);
      }
    } else if (o.isExternal) {
      const wallRooms = wallRoomMap.get(o.wallId) ?? [];
      for (const roomId of wallRooms) {
        ensure(roomId);
        adj.get(roomId)!.add(OUTSIDE);
        adj.get(OUTSIDE)!.add(roomId);

        // For full-partition sub_rooms: check if this external door's position
        // falls within a sub_room's rect, and if so, connect that sub_room to OUTSIDE
        const childSubs = subRooms.filter(s => s.parentRoomId === roomId && s.isFullPartition);
        for (const sr of childSubs) {
          const EPS = 1;
          const inX = o.cx >= sr.rect.x - EPS && o.cx <= sr.rect.x + sr.rect.w + EPS;
          const inY = o.cy >= sr.rect.y - EPS && o.cy <= sr.rect.y + sr.rect.h + EPS;
          if (inX && inY) {
            ensure(sr.id);
            adj.get(sr.id)!.add(OUTSIDE);
            adj.get(OUTSIDE)!.add(sr.id);
          }
        }
      }
    }
  }

  // Propagate parent-room connectivity to sub_rooms
  const roomsWithFullPartition = new Set<string>();
  const roomsWithSubRooms = new Set<string>();
  for (const sr of subRooms) {
    roomsWithSubRooms.add(sr.parentRoomId);
    if (sr.isFullPartition) roomsWithFullPartition.add(sr.parentRoomId);
  }

  for (const sr of subRooms) {
    if (!sr.isFullPartition) {
      // Partial partition: sub_room is freely connected to parent (no wall blocks fully)
      ensure(sr.id);
      adj.get(sr.id)!.add(sr.parentRoomId);
      adj.get(sr.parentRoomId)!.add(sr.id);
    }
  }

  // Check rooms without any door
  // For rooms with ONLY full-partition sub_rooms, skip parent check (doors go to sub_rooms)
  // For rooms with partial-partition sub_rooms, still check parent (it remains the connectivity node)
  for (const roomId of roomIds) {
    if (roomsWithFullPartition.has(roomId)) continue;
    const neighbors = adj.get(roomId);
    if (!neighbors || neighbors.size === 0) {
      issues.push({
        severity: 'warning',
        code: 'ROOM_WITHOUT_DOOR',
        message: `Room "${roomId}" has no door connections`,
        roomIds: [roomId],
      });
    }
  }

  // Check all sub_rooms for door connections
  for (const sr of subRooms) {
    if (!sr.isFullPartition) continue; // partial sub_rooms inherit parent connectivity
    const neighbors = adj.get(sr.id);
    if (!neighbors || neighbors.size === 0) {
      issues.push({
        severity: 'warning',
        code: 'SUB_ROOM_WITHOUT_DOOR',
        message: `Sub-room "${sr.id}" (in "${sr.parentRoomId}") is fully partitioned but has no door connections`,
        roomIds: [sr.id, sr.parentRoomId],
      });
    }
  }

  // BFS from outside to find reachable rooms
  const visited = new Set<string>();
  const bfsQueue: string[] = [OUTSIDE];
  visited.add(OUTSIDE);

  let bfsHead = 0;
  while (bfsHead < bfsQueue.length) {
    const current = bfsQueue[bfsHead++];
    for (const neighbor of adj.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        bfsQueue.push(neighbor);
      }
    }
  }

  visited.delete(OUTSIDE);

  // Check reachability for all rooms (except those with full-partition sub_rooms)
  for (const roomId of roomIds) {
    if (roomsWithFullPartition.has(roomId)) continue;
    if (!visited.has(roomId)) {
      issues.push({
        severity: 'error',
        code: 'UNREACHABLE_ROOM',
        message: `Room "${roomId}" is not reachable from any external entrance`,
        roomIds: [roomId],
      });
    }
  }

  // Check reachability for full-partition sub_rooms
  for (const sr of subRooms) {
    if (!sr.isFullPartition) continue;
    if (!visited.has(sr.id)) {
      issues.push({
        severity: 'error',
        code: 'UNREACHABLE_ROOM',
        message: `Sub-room "${sr.id}" (in "${sr.parentRoomId}") is not reachable from any external entrance`,
        roomIds: [sr.id, sr.parentRoomId],
      });
    }
  }

  // Sub-area isolation check: skip rooms that have sub_rooms defined
  for (const room of model.rooms) {
    if (roomsWithSubRooms.has(room.id)) continue;
    const result = detectIsolatedSubareas(room, model.walls, model.openings);
    if (result.isolated) {
      const areaSqm = (result.unreachableAreaMm2 / 1_000_000).toFixed(1);
      issues.push({
        severity: 'error',
        code: 'ISOLATED_SUBAREA',
        message: `Room "${room.id}" has an isolated sub-area (${areaSqm}m²) created by partition wall(s): ${result.barrierWallIds.join(', ')}`,
        roomIds: [room.id],
        wallId: result.barrierWallIds[0],
      });
    }
  }

  // Equipment validation
  validateEquipment(model, issues);

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  return {
    issues,
    errorCount,
    warningCount,
    ok: errorCount === 0,
  };
}

export function formatValidation(result: ValidationResult): string {
  if (result.issues.length === 0) {
    return 'Validation: OK (no issues)';
  }

  const lines: string[] = [];
  for (const issue of result.issues) {
    const prefix = issue.severity === 'error' ? '  ERROR' : '  WARN ';
    lines.push(`${prefix} [${issue.code}] ${issue.message}`);
  }

  const summary = `Validation: ${result.errorCount} error(s), ${result.warningCount} warning(s)`;
  return [summary, ...lines].join('\n');
}

// ─── Equipment validation ───

function validateEquipment(model: BuildingModel, issues: ValidationIssue[]): void {
  const equipment = model.equipment ?? [];
  if (equipment.length === 0) return;

  const roomMap = new Map(model.rooms.map(r => [r.id, r]));

  for (const eq of equipment) {
    // Check room exists
    const room = roomMap.get(eq.roomId);
    if (!room) {
      issues.push({
        severity: 'error',
        code: 'EQUIPMENT_UNKNOWN_ROOM',
        message: `Equipment "${eq.id}" references unknown room "${eq.roomId}"`,
        roomIds: [eq.roomId],
      });
      continue;
    }

    // Check equipment fits within room bounding rect
    const br = room.boundingRect;
    const outLeft = eq.x < br.x - EPS;
    const outBottom = eq.y < br.y - EPS;
    const outRight = eq.x + eq.w > br.x + br.w + EPS;
    const outTop = eq.y + eq.h > br.y + br.h + EPS;
    if (outLeft || outBottom || outRight || outTop) {
      issues.push({
        severity: 'warning',
        code: 'EQUIPMENT_OUT_OF_BOUNDS',
        message: `Equipment "${eq.id}" extends outside room "${eq.roomId}" bounding rect`,
        roomIds: [eq.roomId],
      });
    }
  }

  // Check overlaps between equipment in the same room
  const byRoom = new Map<string, ResolvedEquipment[]>();
  for (const eq of equipment) {
    const list = byRoom.get(eq.roomId) ?? [];
    list.push(eq);
    byRoom.set(eq.roomId, list);
  }

  for (const [, eqs] of byRoom) {
    for (let i = 0; i < eqs.length; i++) {
      for (let j = i + 1; j < eqs.length; j++) {
        const a = eqs[i];
        const b = eqs[j];
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (overlapX > EPS && overlapY > EPS) {
          issues.push({
            severity: 'warning',
            code: 'EQUIPMENT_OVERLAP',
            message: `Equipment "${a.id}" and "${b.id}" overlap in room "${a.roomId}"`,
            roomIds: [a.roomId],
          });
        }
      }
    }
  }

  // Check equipment-opening overlaps on shared walls
  detectEquipmentOpeningOverlaps(model, issues);

  // Check equipment blocking door clearance zones (2D)
  detectDoorClearanceBlocked(model, issues);
}

// ─── Equipment-Opening wall overlap detection ───

function detectEquipmentOpeningOverlaps(
  model: BuildingModel,
  issues: ValidationIssue[],
): void {
  const equipment = model.equipment ?? [];
  if (equipment.length === 0) return;

  // Group equipment by wallId
  const eqByWall = new Map<string, ResolvedEquipment[]>();
  for (const eq of equipment) {
    if (!eq.wallId) continue;
    const list = eqByWall.get(eq.wallId) ?? [];
    list.push(eq);
    eqByWall.set(eq.wallId, list);
  }

  // Group openings by wallId
  const openByWall = new Map<string, ResolvedOpening[]>();
  for (const o of model.openings) {
    const list = openByWall.get(o.wallId) ?? [];
    list.push(o);
    openByWall.set(o.wallId, list);
  }

  // Pre-build wall lookup for O(1) access
  const wallMap = new Map(model.walls.map(w => [w.id, w]));

  // For each wall that has both equipment and openings, check 1D overlap
  for (const [wallId, eqs] of eqByWall) {
    const opens = openByWall.get(wallId);
    if (!opens) continue;

    const wall = wallMap.get(wallId);
    if (!wall) continue;

    const isHorizontalWall = Math.abs(wall.y1 - wall.y2) < EPS;

    for (const eq of eqs) {
      const eqStart = isHorizontalWall ? eq.x : eq.y;
      const eqEnd = isHorizontalWall ? eq.x + eq.w : eq.y + eq.h;

      for (const o of opens) {
        const oCenter = isHorizontalWall ? o.cx : o.cy;
        const oHalfW = o.w / 2;
        const oStart = oCenter - oHalfW;
        const oEnd = oCenter + oHalfW;

        const overlap = Math.min(eqEnd, oEnd) - Math.max(eqStart, oStart);
        if (overlap > EPS) {
          const kind = isDoor(o) ? 'door' : 'window';
          issues.push({
            severity: isDoor(o) ? 'error' : 'warning',
            code: 'EQUIPMENT_OPENING_WALL_OVERLAP',
            message: `Equipment "${eq.id}" overlaps ${kind} "${o.id}" on wall "${wallId}" (overlap: ${Math.round(overlap)}mm)`,
            roomIds: [eq.roomId],
            equipmentId: eq.id,
            openingId: o.id,
            wallId,
          });
        }
      }
    }
  }
}

// ─── Door clearance zone detection (2D) ───

/**
 * Detects equipment that blocks the clearance zone in front of a door.
 * For each door, a rectangular clearance zone extends into the adjacent room(s)
 * by the door width (along-wall) × door width (into-room depth).
 * Any equipment whose 2D footprint overlaps this zone is flagged.
 */
function detectDoorClearanceBlocked(
  model: BuildingModel,
  issues: ValidationIssue[],
): void {
  const equipment = model.equipment ?? [];
  if (equipment.length === 0) return;

  // Only swing doors (片開き) need clearance — sliding doors (引き戸) don't swing
  const swingDoors = model.openings.filter(o => isDoor(o) && o.style === '片開き');
  if (swingDoors.length === 0) return;

  const wallMap = new Map(model.walls.map(w => [w.id, w]));
  const roomMap = new Map(model.rooms.map(r => [r.id, r]));

  // Group equipment by roomId
  const eqByRoom = new Map<string, ResolvedEquipment[]>();
  for (const eq of equipment) {
    const list = eqByRoom.get(eq.roomId) ?? [];
    list.push(eq);
    eqByRoom.set(eq.roomId, list);
  }

  for (const door of swingDoors) {
    const wall = wallMap.get(door.wallId);
    if (!wall) continue;

    const isHorizontal = Math.abs(wall.y1 - wall.y2) < EPS;
    const wallPos = isHorizontal ? wall.y1 : wall.x1;
    const doorHalfW = door.w / 2;
    const clearanceDepth = door.w; // swing radius = door width

    // Check each room adjacent to this wall
    for (const roomId of wall.rooms) {
      const room = roomMap.get(roomId);
      if (!room) continue;

      const roomEqs = eqByRoom.get(roomId);
      if (!roomEqs) continue;

      // Determine which side of the wall the room is on
      const br = room.boundingRect;
      const roomCenter = isHorizontal
        ? br.y + br.h / 2
        : br.x + br.w / 2;

      // Clearance zone extends from the wall INTO the room
      let clearX: number, clearY: number, clearW: number, clearH: number;

      if (isHorizontal) {
        clearX = door.cx - doorHalfW;
        clearW = door.w;
        if (roomCenter < wallPos) {
          // Room is south of wall → clearance extends south (y decreasing)
          clearY = wallPos - clearanceDepth;
          clearH = clearanceDepth;
        } else {
          // Room is north of wall → clearance extends north (y increasing)
          clearY = wallPos;
          clearH = clearanceDepth;
        }
      } else {
        clearY = door.cy - doorHalfW;
        clearH = door.w;
        if (roomCenter < wallPos) {
          // Room is west of wall → clearance extends west (x decreasing)
          clearX = wallPos - clearanceDepth;
          clearW = clearanceDepth;
        } else {
          // Room is east of wall → clearance extends east (x increasing)
          clearX = wallPos;
          clearW = clearanceDepth;
        }
      }

      // 2D rect-rect overlap check
      for (const eq of roomEqs) {
        const overlapX = Math.min(eq.x + eq.w, clearX + clearW) - Math.max(eq.x, clearX);
        const overlapY = Math.min(eq.y + eq.h, clearY + clearH) - Math.max(eq.y, clearY);

        if (overlapX > EPS && overlapY > EPS) {
          issues.push({
            severity: 'error',
            code: 'EQUIPMENT_DOOR_CLEARANCE_BLOCKED',
            message: `Equipment "${eq.id}" blocks door "${door.id}" clearance zone in room "${roomId}" (${Math.round(overlapX)}×${Math.round(overlapY)}mm overlap)`,
            roomIds: [roomId],
            equipmentId: eq.id,
            openingId: door.id,
            wallId: door.wallId,
          });
        }
      }
    }
  }
}
