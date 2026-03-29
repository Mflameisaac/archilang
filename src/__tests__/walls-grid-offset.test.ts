import { describe, it, expect } from 'vitest';
import { resolve, resolveWallPoint } from '../resolver.js';
import { parseArchilang } from '../parser.js';
import { WallPointGrid, WallPointMm } from '../types.js';

const BASE_YAML = `
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
      x_spans: [3, 5]
      y_spans: [4, 3]
  rooms:
    - id: ldk
      floor: 1F
      type: LDK
      grid_rect: { x: 3, y: 0, w: 5, h: 7 }
    - id: bedroom
      floor: 1F
      type: 寝室
      grid_rect: { x: 0, y: 3, w: 3, h: 4 }
    - id: bath_area
      floor: 1F
      type: 浴室・洗面
      grid_rect: { x: 0, y: 0, w: 3, h: 3 }
  openings: []
`;

describe('resolveWallPoint', () => {
  const moduleSize = 910;
  const floorGrid = { x_spans: [3, 5], y_spans: [4, 3] };

  it('resolves mm point directly', () => {
    const p: WallPointMm = { x: 2730, y: 1000 };
    const result = resolveWallPoint(p, moduleSize, floorGrid);
    expect(result).toEqual({ x: 2730, y: 1000 });
  });

  it('resolves grid-only point (no offset) to grid position', () => {
    const p: WallPointGrid = { grid: { x: 3, y: 0 } };
    const result = resolveWallPoint(p, moduleSize, floorGrid);
    // grid x=3 → 3 * 910 = 2730mm
    expect(result).toEqual({ x: 2730, y: 0 });
  });

  it('resolves grid + dx/dy offset', () => {
    const p: WallPointGrid = { grid: { x: 3, y: 0 }, dx: 150, dy: 0 };
    const result = resolveWallPoint(p, moduleSize, floorGrid);
    expect(result).toEqual({ x: 2730 + 150, y: 0 });
  });

  it('resolves grid + negative offset', () => {
    const p: WallPointGrid = { grid: { x: 3, y: 4 }, dx: -100, dy: 50 };
    const result = resolveWallPoint(p, moduleSize, floorGrid);
    expect(result).toEqual({ x: 2730 - 100, y: 3640 + 50 });
  });
});

describe('walls.segments with grid+offset', () => {
  it('resolves wall with grid-only points', () => {
    const yaml = BASE_YAML + `
  walls:
    segments:
      - id: w_grid
        floor: 1F
        from: { grid: { x: 3, y: 0 } }
        to: { grid: { x: 3, y: 7 } }
`;
    const model = resolve(parseArchilang(yaml));
    const wall = model.walls.find(w => w.id === 'w_grid');
    expect(wall).toBeDefined();
    expect(wall!.x1).toBe(3 * 910); // 2730
    expect(wall!.y1).toBe(0);
    expect(wall!.x2).toBe(3 * 910); // 2730
    expect(wall!.y2).toBe(7 * 910); // 6370
  });

  it('resolves wall with grid+offset points', () => {
    const yaml = BASE_YAML + `
  walls:
    segments:
      - id: w_offset
        floor: 1F
        from: { grid: { x: 3, y: 0 }, dx: 150, dy: 0 }
        to: { grid: { x: 3, y: 7 }, dx: 150, dy: 0 }
`;
    const model = resolve(parseArchilang(yaml));
    const wall = model.walls.find(w => w.id === 'w_offset');
    expect(wall).toBeDefined();
    expect(wall!.x1).toBe(2730 + 150);
    expect(wall!.y1).toBe(0);
    expect(wall!.x2).toBe(2730 + 150);
    expect(wall!.y2).toBe(6370);
  });

  it('allows mixed from=grid, to=mm', () => {
    const yaml = BASE_YAML + `
  walls:
    segments:
      - id: w_mixed
        floor: 1F
        from: { grid: { x: 3, y: 0 }, dx: 150, dy: 0 }
        to: { x: 2880, y: 6370 }
`;
    const model = resolve(parseArchilang(yaml));
    const wall = model.walls.find(w => w.id === 'w_mixed');
    expect(wall).toBeDefined();
    expect(wall!.x1).toBe(2880); // 2730+150
    expect(wall!.y1).toBe(0);
    expect(wall!.x2).toBe(2880);
    expect(wall!.y2).toBe(6370);
  });
});
