import { describe, it, expect } from 'vitest';
import { resolve, extractWalls } from '../resolver.js';
import { parseArchilang } from '../parser.js';
import { validateBuilding } from '../validator.js';
import { ResolvedRoom, Rect } from '../types.js';
import { readFileSync } from 'fs';
import { resolve as pathResolve } from 'path';

const samplesDir = pathResolve(import.meta.dirname, '../../samples');

function loadAndResolve(name: string) {
  const yaml = readFileSync(`${samplesDir}/${name}.yaml`, 'utf-8');
  return resolve(parseArchilang(yaml));
}

describe('multi-rect rooms (grid_rects)', () => {
  it('resolves L-shaped LDK with two component rects', () => {
    const model = loadAndResolve('l-shaped-ldk');
    const ldk = model.rooms.find(r => r.id === 'ldk')!;

    expect(ldk.rects).toHaveLength(2);
    expect(ldk.gridRects).toHaveLength(2);

    // rect1: south part (0,0,7,4) in grid → mm
    expect(ldk.rects[0]).toEqual({ x: 0, y: 0, w: 7 * 910, h: 4 * 910 });
    // rect2: north-east part (3,4,4,3) in grid → mm
    expect(ldk.rects[1]).toEqual({ x: 3 * 910, y: 4 * 910, w: 4 * 910, h: 3 * 910 });

    // boundingRect should encompass both
    expect(ldk.boundingRect).toEqual({
      x: 0,
      y: 0,
      w: 7 * 910,
      h: 7 * 910,
    });
  });

  it('resolves single-rect rooms normally alongside multi-rect rooms', () => {
    const model = loadAndResolve('l-shaped-ldk');
    const bedroom = model.rooms.find(r => r.id === 'bedroom')!;

    expect(bedroom.rects).toHaveLength(1);
    expect(bedroom.gridRects).toHaveLength(1);
    expect(bedroom.boundingRect).toEqual(bedroom.rects[0]);
  });

  it('extracts correct perimeter walls for L-shaped room', () => {
    const model = loadAndResolve('l-shaped-ldk');

    // L-shaped LDK should NOT have internal walls between its own rects
    // Verify no wall has only 'ldk' on both sides
    const ldkOnlyWalls = model.walls.filter(
      w => w.rooms.length === 1 && w.rooms[0] === 'ldk'
    );
    // All ldk-only walls should be external
    for (const w of ldkOnlyWalls) {
      expect(w.isExternal).toBe(true);
    }

    // The shared edge between the two LDK rects (y=4*910, x=0 to 3*910)
    // should NOT produce a wall (it's internal to the room shape)
    // But the edge from x=0 to x=3*910 at y=4*910 is NOT between two LDK rects;
    // the south rect goes from x=0..7 at y=4, the north rect starts at x=3 at y=4.
    // So the shared edge is x=3..7 at y=4 (south of north rect matches north of south rect).
    // The segment x=0..3 at y=4 is north edge of south rect only (external or shared with bedroom).

    // Check bedroom-LDK shared wall exists
    const bedroomLdkWall = model.walls.find(
      w => w.rooms.includes('ldk') && w.rooms.includes('bedroom')
    );
    expect(bedroomLdkWall).toBeDefined();
    expect(bedroomLdkWall!.isExternal).toBe(false);
  });

  it('calculates correct area for L-shaped room', () => {
    const model = loadAndResolve('l-shaped-ldk');
    const ldk = model.rooms.find(r => r.id === 'ldk')!;

    const totalArea = ldk.rects.reduce((sum, r) => sum + r.w * r.h, 0);
    // rect1: 7*4 = 28 grid cells, rect2: 4*3 = 12 grid cells = 40 grid cells total
    expect(totalArea).toBe(40 * 910 * 910);
  });

  it('resolves all openings in L-shaped plan', () => {
    const model = loadAndResolve('l-shaped-ldk');
    expect(model.skippedOpenings).toHaveLength(0);
    expect(model.openings.length).toBeGreaterThanOrEqual(5);
  });

  it('places room/wall opening on outermost exterior wall for multi-rect rooms', () => {
    // W3 is ldk/north — LDK has two north-facing walls:
    //   1. shared with bedroom at y=4*910 (internal)
    //   2. external north facade at y=7*910 (external)
    // findRoomWall should prefer the exterior/outermost one (y=7*910)
    const model = loadAndResolve('l-shaped-ldk');
    const w3 = model.openings.find(o => o.id === 'W3');
    expect(w3).toBeDefined();
    // W3 should be on the external north wall at y=7*910
    expect(w3!.cy).toBe(7 * 910);
    expect(w3!.isExternal).toBe(true);
  });

  it('wallSideForRoom correctly identifies sides for staggered multi-rect rooms', () => {
    const model = loadAndResolve('l-shaped-ldk');
    const ldk = model.rooms.find(r => r.id === 'ldk')!;

    // The south wall of the LDK (y=0) should be identified as 'south'
    const southWall = model.walls.find(
      w => w.rooms.includes('ldk') && w.y1 === 0 && w.y2 === 0
    );
    expect(southWall).toBeDefined();

    // The internal edge between LDK rects at y=4*910 was cancelled, so
    // we should NOT have a horizontal wall that is LDK-only at y=4*910 for x in [3*910..7*910]
    const internalEdgeY = 4 * 910;
    const falseInternalWall = model.walls.find(
      w => w.rooms.length === 1 && w.rooms[0] === 'ldk' &&
           // Must be horizontal wall (y1 === y2) at the internal edge position
           w.y1 === internalEdgeY && w.y2 === internalEdgeY &&
           w.x1 >= 3 * 910 && w.x2 <= 7 * 910
    );
    expect(falseInternalWall).toBeUndefined();

    // The LDK north wall segment at y=7*910 (from the north rect) should exist
    const northWall = model.walls.find(
      w => w.rooms.includes('ldk') && w.y1 === 7 * 910 && w.y2 === 7 * 910
    );
    expect(northWall).toBeDefined();
    expect(northWall!.isExternal).toBe(true);
  });

  it('passes validation for L-shaped LDK plan', () => {
    const model = loadAndResolve('l-shaped-ldk');
    const result = validateBuilding(model);
    expect(result.ok).toBe(true);
  });

  it('merges collinear perimeter segments on the same side', () => {
    // The L-shaped LDK has south edge from rect1: (0, 0, 7*910, 4*910)
    // This south edge should be ONE wall segment, not fragmented
    const model = loadAndResolve('l-shaped-ldk');
    const ldkSouthWalls = model.walls.filter(
      w => w.rooms.includes('ldk') && w.y1 === 0 && w.y2 === 0
    );
    // Should be exactly one continuous south wall for LDK (x=0 to x=7*910)
    expect(ldkSouthWalls).toHaveLength(1);
    expect(ldkSouthWalls[0].x1).toBe(0);
    expect(ldkSouthWalls[0].x2).toBe(7 * 910);
  });

  it('resolve() handles legacy grid_rect without parseArchilang normalization', () => {
    // Simulate a programmatic caller passing grid_rect directly
    const spec = {
      archilang: '0.2',
      site: { orientation: 'south' },
      building: {
        structure: '木造軸組',
        module: 'shaku',
        stories: 1,
        defaults: {
          ceiling_height: '2400mm',
          external_wall: { thickness: '130mm' },
          internal_wall: { partition: '90mm' },
        },
      },
      geometry: {
        grids: { module: '910mm', '1F': { x_spans: [3], y_spans: [3] } },
        rooms: [{ id: 'r1', floor: '1F', type: 'Room', grid_rect: { x: 0, y: 0, w: 3, h: 3 } }],
        openings: [],
      },
    };
    // Should not throw even though grid_rects is undefined
    expect(() => resolve(spec as any)).not.toThrow();
    const model = resolve(spec as any);
    expect(model.rooms[0].rects).toHaveLength(1);
  });

  it('resolve() throws for room with no geometry', () => {
    const spec = {
      archilang: '0.2',
      site: { orientation: 'south' },
      building: {
        structure: '木造軸組',
        module: 'shaku',
        stories: 1,
        defaults: {
          ceiling_height: '2400mm',
          external_wall: { thickness: '130mm' },
          internal_wall: { partition: '90mm' },
        },
      },
      geometry: {
        grids: { module: '910mm', '1F': { x_spans: [3], y_spans: [3] } },
        rooms: [{ id: 'r1', floor: '1F', type: 'Room' }],
        openings: [],
      },
    };
    expect(() => resolve(spec as any)).toThrow('no geometry defined');
  });

  it('resolves sub_rooms on multi-rect rooms with partial partition (cellBasedSplit)', () => {
    // L-shaped room: rect1=(0,0,7,3) + rect2=(0,3,3,2) in grid
    // Partial wall at x=2730 from y=0 to y=1820 (only 2 grids high, not full rect1 height of 3)
    // This does NOT fully partition because cells above y=1820 on the left can still reach the right
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
      x_spans: [3, 4]
      y_spans: [3, 2]
  rooms:
    - id: ldk
      floor: 1F
      type: LDK
      grid_rects:
        - { x: 0, y: 0, w: 7, h: 3 }
        - { x: 0, y: 3, w: 3, h: 2 }
      sub_rooms:
        - id: kitchen
          type: キッチン
          seed: { x: 5, y: 1 }
        - id: living
          type: リビング
          seed: { x: 1, y: 1 }
  openings: []
  walls:
    mode: additive
    segments:
      - id: w_counter
        floor: 1F
        from: { x: 2730, y: 0 }
        to: { x: 2730, y: 1820 }
        thickness: 90mm
        type: internal
`;
    const model = resolve(parseArchilang(yaml));
    expect(model.subRooms).toHaveLength(2);

    const kitchen = model.subRooms.find(s => s.id === 'kitchen');
    const living = model.subRooms.find(s => s.id === 'living');
    expect(kitchen).toBeDefined();
    expect(living).toBeDefined();
    expect(kitchen!.parentRoomId).toBe('ldk');
    expect(living!.parentRoomId).toBe('ldk');
    expect(kitchen!.isFullPartition).toBe(false);
    expect(living!.isFullPartition).toBe(false);

    // Kitchen is right of barrier (x=2730): 4*3 grids = 12 modules² (right side of rect1 only)
    // Living is left of barrier: 3*3 grids (left side of rect1) + 3*2 grids (rect2) = 15 modules²
    const mod = 910;
    expect(kitchen!.areaMm2).toBe(4 * 3 * mod * mod);
    expect(living!.areaMm2).toBe((3 * 3 + 3 * 2) * mod * mod);
  });

  it('resolves sub_rooms on multi-rect rooms with full partition (flood-fill)', () => {
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
      x_spans: [3, 4]
      y_spans: [3, 2]
  rooms:
    - id: ldk
      floor: 1F
      type: LDK
      grid_rects:
        - { x: 0, y: 0, w: 7, h: 3 }
        - { x: 0, y: 3, w: 3, h: 2 }
      sub_rooms:
        - id: east_side
          type: 東側
          seed: { x: 5, y: 1 }
        - id: west_side
          type: 西側
          seed: { x: 1, y: 1 }
  openings: []
  walls:
    mode: additive
    segments:
      # Full-height wall that completely partitions the L-shape
      - id: w_partition
        floor: 1F
        from: { x: 2730, y: 0 }
        to: { x: 2730, y: 4550 }
        thickness: 90mm
        type: internal
`;
    const model = resolve(parseArchilang(yaml));
    expect(model.subRooms).toHaveLength(2);

    const east = model.subRooms.find(s => s.id === 'east_side');
    const west = model.subRooms.find(s => s.id === 'west_side');
    expect(east).toBeDefined();
    expect(west).toBeDefined();
    expect(east!.isFullPartition).toBe(true);
    expect(west!.isFullPartition).toBe(true);

    // East side: 4*3 grids (only bottom rect, right of partition)
    // West side: 3*3 + 3*2 grids (left of partition, both rects)
    const mod = 910;
    expect(east!.areaMm2).toBe(4 * 3 * mod * mod);
    expect(west!.areaMm2).toBe((3 * 3 + 3 * 2) * mod * mod);
  });
});

describe('parser grid_rect / grid_rects normalization', () => {
  it('normalizes grid_rect to grid_rects', () => {
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
      x_spans: [3]
      y_spans: [3]
  rooms:
    - id: r1
      floor: 1F
      type: Room
      grid_rect: { x: 0, y: 0, w: 3, h: 3 }
  openings: []
`;
    const spec = parseArchilang(yaml);
    expect(spec.geometry.rooms[0].grid_rects).toEqual([{ x: 0, y: 0, w: 3, h: 3 }]);
    expect(spec.geometry.rooms[0].grid_rect).toBeUndefined();
  });

  it('rejects both grid_rect and grid_rects specified', () => {
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
      x_spans: [3]
      y_spans: [3]
  rooms:
    - id: r1
      floor: 1F
      type: Room
      grid_rect: { x: 0, y: 0, w: 3, h: 3 }
      grid_rects:
        - { x: 0, y: 0, w: 3, h: 3 }
  openings: []
`;
    expect(() => parseArchilang(yaml)).toThrow('mutually exclusive');
  });

  it('rejects empty grid_rects', () => {
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
      x_spans: [3]
      y_spans: [3]
  rooms:
    - id: r1
      floor: 1F
      type: Room
      grid_rects: []
  openings: []
`;
    expect(() => parseArchilang(yaml)).toThrow('must not be empty');
  });

  it('rejects overlapping grid_rects', () => {
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
      x_spans: [4, 4]
      y_spans: [4, 4]
  rooms:
    - id: t_room
      floor: 1F
      type: Room
      grid_rects:
        - { x: 0, y: 0, w: 4, h: 4 }
        - { x: 2, y: 2, w: 4, h: 4 }
  openings: []
`;
    expect(() => parseArchilang(yaml)).toThrow('overlap');
  });

  it('allows adjacent (touching) grid_rects without error', () => {
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
      x_spans: [3, 4]
      y_spans: [4, 3]
  rooms:
    - id: ldk
      floor: 1F
      type: LDK
      grid_rects:
        - { x: 0, y: 0, w: 7, h: 4 }
        - { x: 3, y: 4, w: 4, h: 3 }
  openings: []
`;
    expect(() => parseArchilang(yaml)).not.toThrow();
  });

  it('rejects disjoint (completely separated) grid_rects', () => {
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
      x_spans: [3, 1, 3]
      y_spans: [3]
  rooms:
    - id: r1
      floor: 1F
      type: Room
      grid_rects:
        - { x: 0, y: 0, w: 3, h: 3 }
        - { x: 4, y: 0, w: 3, h: 3 }
  openings: []
`;
    expect(() => parseArchilang(yaml)).toThrow('edge-connected');
  });

  it('rejects corner-touching (diagonal) grid_rects', () => {
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
      x_spans: [2, 2]
      y_spans: [2, 2]
  rooms:
    - id: r1
      floor: 1F
      type: Room
      grid_rects:
        - { x: 0, y: 0, w: 2, h: 2 }
        - { x: 2, y: 2, w: 2, h: 2 }
  openings: []
`;
    expect(() => parseArchilang(yaml)).toThrow('edge-connected');
  });

  it('rejects missing both grid_rect and grid_rects', () => {
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
      x_spans: [3]
      y_spans: [3]
  rooms:
    - id: r1
      floor: 1F
      type: Room
  openings: []
`;
    expect(() => parseArchilang(yaml)).toThrow('must specify either');
  });
});

describe('backward compatibility', () => {
  it('resolves all existing sample files without error', () => {
    const samples = [
      'basic-3room', '1r-studio', '2ldk-apartment', 'compact-2dk',
      '3ldk-house', 'l-shaped-plan', '4ldk-complex',
      'u-shaped-courtyard', 'twin-courtyard',
    ];
    for (const name of samples) {
      expect(() => loadAndResolve(name), `sample "${name}" should resolve`).not.toThrow();
    }
  });
});
