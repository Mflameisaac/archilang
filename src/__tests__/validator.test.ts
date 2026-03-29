import { describe, it, expect } from 'vitest';
import { validateBuilding, formatValidation, detectIsolatedSubareas } from '../validator.js';
import { parseArchilang } from '../parser.js';
import { resolve } from '../resolver.js';
import { BuildingModel, ResolvedRoom, WallEdge, ResolvedOpening, Rect } from '../types.js';
import { readFileSync } from 'fs';
import { resolve as pathResolve } from 'path';

const samplesDir = pathResolve(import.meta.dirname, '../../samples');

function loadAndResolve(name: string) {
  const yaml = readFileSync(`${samplesDir}/${name}.yaml`, 'utf-8');
  return resolve(parseArchilang(yaml));
}

/** Helper to construct a ResolvedRoom from a single rect (for backward-compatible tests) */
function makeRoom(id: string, type: string, rect: Rect, gridRect: { x: number; y: number; w: number; h: number }): ResolvedRoom {
  return { id, type, boundingRect: rect, rects: [rect], gridRects: [gridRect] };
}

function makeModel(overrides: Partial<BuildingModel> = {}): BuildingModel {
  return {
    moduleSize: 910,
    externalWallThickness: 130,
    internalWallThickness: 90,
    totalGridX: 8,
    totalGridY: 7,
    xSpans: [3, 5],
    ySpans: [3, 4],
    rooms: [],
    walls: [],
    openings: [],
    skippedOpenings: [],
    orientation: 'south',
    extraGridLines: { x: [], y: [] },
    ...overrides,
  };
}

describe('validateBuilding', () => {
  it('passes for basic-3room (all rooms connected)', () => {
    const model = loadAndResolve('basic-3room');
    const result = validateBuilding(model);
    expect(result.ok).toBe(true);
    expect(result.errorCount).toBe(0);
  });

  it('detects unreachable room with no doors', () => {
    const rooms: ResolvedRoom[] = [
      makeRoom('roomA', 'Room A', { x: 0, y: 0, w: 2730, h: 2730 }, { x: 0, y: 0, w: 3, h: 3 }),
      makeRoom('roomB', 'Room B', { x: 2730, y: 0, w: 2730, h: 2730 }, { x: 3, y: 0, w: 3, h: 3 }),
    ];
    const walls: WallEdge[] = [
      { id: 'wall_0', side: 'south', x1: 0, y1: 0, x2: 2730, y2: 0, isExternal: true, thickness: 130, rooms: ['roomA'] },
      { id: 'wall_1', side: 'east', x1: 5460, y1: 0, x2: 5460, y2: 2730, isExternal: true, thickness: 130, rooms: ['roomB'] },
    ];
    const openings: ResolvedOpening[] = [
      { id: 'D1', type: 'AD', style: '片開き', wallId: 'wall_0', cx: 1365, cy: 0, w: 900, h: 2000, orientation: 'horizontal', isExternal: true, wallSide: 'south' },
    ];

    const model = makeModel({ rooms, walls, openings });
    const result = validateBuilding(model);

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      severity: 'error',
      code: 'UNREACHABLE_ROOM',
      roomIds: ['roomB'],
    }));
    expect(result.issues).toContainEqual(expect.objectContaining({
      severity: 'warning',
      code: 'ROOM_WITHOUT_DOOR',
      roomIds: ['roomB'],
    }));
  });

  it('detects room reachable through chain but not directly from outside', () => {
    const rooms: ResolvedRoom[] = [
      makeRoom('entrance', '玄関', { x: 0, y: 0, w: 1820, h: 1820 }, { x: 0, y: 0, w: 2, h: 2 }),
      makeRoom('hall', 'ホール', { x: 1820, y: 0, w: 1820, h: 1820 }, { x: 2, y: 0, w: 2, h: 2 }),
      makeRoom('bedroom', '寝室', { x: 3640, y: 0, w: 1820, h: 1820 }, { x: 4, y: 0, w: 2, h: 2 }),
    ];
    const walls: WallEdge[] = [
      { id: 'wall_ext', side: 'south', x1: 0, y1: 0, x2: 1820, y2: 0, isExternal: true, thickness: 130, rooms: ['entrance'] },
      { id: 'wall_int1', side: 'east', x1: 1820, y1: 0, x2: 1820, y2: 1820, isExternal: false, thickness: 90, rooms: ['entrance', 'hall'] },
      { id: 'wall_int2', side: 'east', x1: 3640, y1: 0, x2: 3640, y2: 1820, isExternal: false, thickness: 90, rooms: ['hall', 'bedroom'] },
    ];
    const openings: ResolvedOpening[] = [
      { id: 'ED1', type: 'AD', style: '片開き', wallId: 'wall_ext', cx: 910, cy: 0, w: 900, h: 2000, orientation: 'horizontal', isExternal: true, wallSide: 'south' },
      { id: 'D1', type: 'WD', style: '片開き', wallId: 'wall_int1', cx: 1820, cy: 910, w: 800, h: 2000, orientation: 'vertical', isExternal: false, connectedRooms: ['entrance', 'hall'] },
      { id: 'D2', type: 'WD', style: '片開き', wallId: 'wall_int2', cx: 3640, cy: 910, w: 800, h: 2000, orientation: 'vertical', isExternal: false, connectedRooms: ['hall', 'bedroom'] },
    ];

    const model = makeModel({ rooms, walls, openings });
    const result = validateBuilding(model);
    expect(result.ok).toBe(true);
    expect(result.errorCount).toBe(0);
  });

  it('detects unknown room reference in opening connects', () => {
    const rooms: ResolvedRoom[] = [
      makeRoom('roomA', 'Room A', { x: 0, y: 0, w: 2730, h: 2730 }, { x: 0, y: 0, w: 3, h: 3 }),
    ];
    const openings: ResolvedOpening[] = [
      { id: 'D1', type: 'WD', style: '片開き', wallId: 'wall_0', cx: 1365, cy: 0, w: 800, h: 2000, orientation: 'horizontal', isExternal: false, connectedRooms: ['roomA', 'nonexistent'] },
    ];

    const model = makeModel({ rooms, openings });
    const result = validateBuilding(model);

    expect(result.issues).toContainEqual(expect.objectContaining({
      severity: 'error',
      code: 'UNKNOWN_ROOM_REF',
      openingId: 'D1',
    }));
  });

  it('reports no issues for empty model', () => {
    const model = makeModel();
    const result = validateBuilding(model);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('detects island cluster (connected to each other but not to outside)', () => {
    const rooms: ResolvedRoom[] = [
      makeRoom('roomA', 'Room A', { x: 0, y: 0, w: 1820, h: 1820 }, { x: 0, y: 0, w: 2, h: 2 }),
      makeRoom('roomB', 'Room B', { x: 1820, y: 0, w: 1820, h: 1820 }, { x: 2, y: 0, w: 2, h: 2 }),
    ];
    const walls: WallEdge[] = [
      { id: 'wall_int', side: 'east', x1: 1820, y1: 0, x2: 1820, y2: 1820, isExternal: false, thickness: 90, rooms: ['roomA', 'roomB'] },
    ];
    const openings: ResolvedOpening[] = [
      { id: 'D1', type: 'WD', style: '片開き', wallId: 'wall_int', cx: 1820, cy: 910, w: 800, h: 2000, orientation: 'vertical', isExternal: false, connectedRooms: ['roomA', 'roomB'] },
    ];

    const model = makeModel({ rooms, walls, openings });
    const result = validateBuilding(model);

    expect(result.ok).toBe(false);
    const unreachable = result.issues.filter(i => i.code === 'UNREACHABLE_ROOM');
    expect(unreachable).toHaveLength(2);
    expect(unreachable.map(i => i.roomIds![0]).sort()).toEqual(['roomA', 'roomB']);
  });
});

describe('detectIsolatedSubareas', () => {
  it('detects no isolation when no internal walls', () => {
    const room = makeRoom('bath', '浴室', { x: 3640, y: 3640, w: 3640, h: 2730 }, { x: 4, y: 4, w: 4, h: 3 });
    const result = detectIsolatedSubareas(room, [], []);
    expect(result.isolated).toBe(false);
  });

  it('detects isolation when vertical wall fully bisects room', () => {
    const room = makeRoom('bath', '浴室', { x: 0, y: 0, w: 3640, h: 2730 }, { x: 0, y: 0, w: 4, h: 3 });
    const walls: WallEdge[] = [
      { id: 'w_partition', side: 'west', x1: 1820, y1: 0, x2: 1820, y2: 2730, isExternal: false, thickness: 90, rooms: [] },
      { id: 'wall_west', side: 'west', x1: 0, y1: 0, x2: 0, y2: 2730, isExternal: false, thickness: 90, rooms: ['hall', 'bath'] },
    ];
    const openings: ResolvedOpening[] = [
      { id: 'D1', type: 'WD', style: '片開き', wallId: 'wall_west', cx: 0, cy: 1365, w: 700, h: 2000, orientation: 'vertical', isExternal: false, connectedRooms: ['hall', 'bath'] },
    ];

    const result = detectIsolatedSubareas(room, walls, openings);
    expect(result.isolated).toBe(true);
    expect(result.unreachableAreaMm2).toBeGreaterThan(0);
    expect(result.barrierWallIds).toContain('w_partition');
  });

  it('no isolation when wall only partially bisects room', () => {
    const room = makeRoom('ldk', 'LDK', { x: 0, y: 0, w: 3640, h: 2730 }, { x: 0, y: 0, w: 4, h: 3 });
    const walls: WallEdge[] = [
      { id: 'w_counter', side: 'west', x1: 1820, y1: 0, x2: 1820, y2: 1820, isExternal: false, thickness: 90, rooms: [] },
      { id: 'wall_south', side: 'south', x1: 0, y1: 0, x2: 3640, y2: 0, isExternal: true, thickness: 130, rooms: ['ldk'] },
    ];
    const openings: ResolvedOpening[] = [
      { id: 'D1', type: 'AD', style: '片開き', wallId: 'wall_south', cx: 910, cy: 0, w: 900, h: 2000, orientation: 'horizontal', isExternal: true, wallSide: 'south' },
    ];

    const result = detectIsolatedSubareas(room, walls, openings);
    expect(result.isolated).toBe(false);
  });

  it('detects isolation when horizontal wall fully bisects room', () => {
    const room = makeRoom('closet', '収納', { x: 7280, y: 3640, w: 1820, h: 2730 }, { x: 8, y: 4, w: 2, h: 3 });
    const walls: WallEdge[] = [
      { id: 'w_shelf', side: 'south', x1: 7280, y1: 4550, x2: 9100, y2: 4550, isExternal: false, thickness: 90, rooms: [] },
      { id: 'wall_south', side: 'south', x1: 7280, y1: 3640, x2: 9100, y2: 3640, isExternal: false, thickness: 90, rooms: ['corridor', 'closet'] },
    ];
    const openings: ResolvedOpening[] = [
      { id: 'D8', type: 'WD', style: '片開き', wallId: 'wall_south', cx: 8190, cy: 3640, w: 600, h: 2000, orientation: 'horizontal', isExternal: false, connectedRooms: ['corridor', 'closet'] },
    ];

    const result = detectIsolatedSubareas(room, walls, openings);
    expect(result.isolated).toBe(true);
    expect(result.unreachableAreaMm2).toBeGreaterThan(0);
    expect(result.barrierWallIds).toContain('w_shelf');
  });

  it('4ldk-complex-invalid detects isolated subareas in bath and closet', () => {
    const model = loadAndResolve('4ldk-complex-invalid');
    const result = validateBuilding(model);

    const subareaIssues = result.issues.filter(i => i.code === 'ISOLATED_SUBAREA');
    expect(subareaIssues.length).toBeGreaterThanOrEqual(2);

    const affectedRooms = subareaIssues.map(i => i.roomIds![0]);
    expect(affectedRooms).toContain('bath');
    expect(affectedRooms).toContain('closet');
  });
});

describe('SKIPPED_OPENING via resolver', () => {
  it('reports SKIPPED_OPENING for bogus connects room reference', () => {
    const yaml = `
archilang: "0.2"
site:
  orientation: south
building:
  structure: 木造軸組
  module: shaku
  stories: 1
  defaults:
    ceiling_height: 2400mm
    external_wall:
      thickness: 130mm
    internal_wall:
      partition: 90mm
geometry:
  grids:
    module: 910mm
    1F:
      x_spans: [3, 3]
      y_spans: [3]
  rooms:
    - id: roomA
      floor: 1F
      type: Room A
      grid_rect: { x: 0, y: 0, w: 3, h: 3 }
    - id: roomB
      floor: 1F
      type: Room B
      grid_rect: { x: 3, y: 0, w: 3, h: 3 }
  openings:
    - id: D_bad
      type: WD
      style: 片開き
      connects: [roomA, ghost_room]
      size: { w: 800, h: 2000 }
    - id: D_good
      type: WD
      style: 片開き
      connects: [roomA, roomB]
      size: { w: 800, h: 2000 }
`;
    const model = resolve(parseArchilang(yaml));
    const result = validateBuilding(model);

    const unknownRef = result.issues.filter(i => i.code === 'UNKNOWN_ROOM_REF');
    expect(unknownRef).toContainEqual(expect.objectContaining({
      severity: 'error',
      code: 'UNKNOWN_ROOM_REF',
      openingId: 'D_bad',
    }));

    expect(model.openings.some(o => o.id === 'D_good')).toBe(true);
  });
});

describe('formatValidation', () => {
  it('formats OK result', () => {
    const output = formatValidation({ issues: [], errorCount: 0, warningCount: 0, ok: true });
    expect(output).toContain('OK');
  });

  it('formats issues with severity prefix', () => {
    const output = formatValidation({
      issues: [
        { severity: 'error', code: 'UNREACHABLE_ROOM', message: 'Room "X" is not reachable', roomIds: ['X'] },
        { severity: 'warning', code: 'ROOM_WITHOUT_DOOR', message: 'Room "X" has no door', roomIds: ['X'] },
      ],
      errorCount: 1,
      warningCount: 1,
      ok: false,
    });
    expect(output).toContain('ERROR');
    expect(output).toContain('WARN');
    expect(output).toContain('1 error(s)');
    expect(output).toContain('1 warning(s)');
  });
});

describe('GRID_MISALIGNMENT detection', () => {
  const BASE = `
archilang: "0.2"
site:
  orientation: south
building:
  structure: 木造軸組
  module: shaku
  stories: 1
  defaults:
    ceiling_height: 2400mm
    external_wall:
      thickness: 130mm
    internal_wall:
      partition: 90mm
geometry:
  grids:
    module: 910mm
    1F:
      x_spans: [4]
      y_spans: [4]
  rooms:
    - id: room1
      floor: 1F
      type: Room
      grid_rect: { x: 0, y: 0, w: 4, h: 4 }
  openings: []
`;

  it('no warning for grid-aligned explicit wall', () => {
    const yaml = BASE + `
  walls:
    segments:
      - id: w_aligned
        floor: 1F
        from: { grid: { x: 2, y: 0 } }
        to: { grid: { x: 2, y: 4 } }
        type: internal
`;
    const model = resolve(parseArchilang(yaml));
    const result = validateBuilding(model);
    const misalign = result.issues.filter(i => i.code === 'GRID_MISALIGNMENT');
    expect(misalign).toHaveLength(0);
  });

  it('warns for mm-specified off-grid explicit wall', () => {
    const yaml = BASE + `
  walls:
    segments:
      - id: w_offgrid
        floor: 1F
        from: { x: 2500, y: 0 }
        to: { x: 2500, y: 3640 }
        type: internal
`;
    const model = resolve(parseArchilang(yaml));
    const result = validateBuilding(model);
    const misalign = result.issues.filter(i => i.code === 'GRID_MISALIGNMENT');
    expect(misalign).toHaveLength(1);
    expect(misalign[0].severity).toBe('warning');
    expect(misalign[0].message).toContain('2500mm');
  });

  it('no warning for grid+offset explicit wall (intentional)', () => {
    const yaml = BASE + `
  walls:
    segments:
      - id: w_offset
        floor: 1F
        from: { grid: { x: 2, y: 0 }, dx: 150 }
        to: { grid: { x: 2, y: 4 }, dx: 150 }
        type: internal
`;
    const model = resolve(parseArchilang(yaml));
    const result = validateBuilding(model);
    const misalign = result.issues.filter(i => i.code === 'GRID_MISALIGNMENT');
    expect(misalign).toHaveLength(0);
  });

  it('no warning for auto-extracted walls', () => {
    // No explicit walls at all
    const model = resolve(parseArchilang(BASE));
    const result = validateBuilding(model);
    const misalign = result.issues.filter(i => i.code === 'GRID_MISALIGNMENT');
    expect(misalign).toHaveLength(0);
  });

  it('no false positive for coordinate near grid boundary (mod - epsilon)', () => {
    // x=1820 (2*910) is on-grid; should not trigger even if near boundary
    const yaml = BASE + `
  walls:
    segments:
      - id: w_near
        floor: 1F
        from: { x: 1820, y: 0 }
        to: { x: 1820, y: 3640 }
        type: internal
`;
    const model = resolve(parseArchilang(yaml));
    const result = validateBuilding(model);
    const misalign = result.issues.filter(i => i.code === 'GRID_MISALIGNMENT');
    expect(misalign).toHaveLength(0);
  });

  it('warns for coordinate exactly half-grid', () => {
    // x=455 (910/2) is off-grid
    const yaml = BASE + `
  walls:
    segments:
      - id: w_half
        floor: 1F
        from: { x: 455, y: 0 }
        to: { x: 455, y: 3640 }
        type: internal
`;
    const model = resolve(parseArchilang(yaml));
    const result = validateBuilding(model);
    const misalign = result.issues.filter(i => i.code === 'GRID_MISALIGNMENT');
    expect(misalign).toHaveLength(1);
  });
});
