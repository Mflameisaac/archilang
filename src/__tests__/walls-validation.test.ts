import { describe, it, expect } from 'vitest';
import { resolve, resolveWallPoint } from '../resolver.js';
import { parseArchilang } from '../parser.js';
import { WallPointGrid } from '../types.js';

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

describe('wall validation: diagonal walls', () => {
  it('throws on diagonal wall (neither horizontal nor vertical)', () => {
    const yaml = BASE_YAML + `
  walls:
    segments:
      - id: w_diag
        floor: 1F
        from: { x: 0, y: 0 }
        to: { x: 1000, y: 1000 }
`;
    expect(() => resolve(parseArchilang(yaml))).toThrow('must be orthogonal');
  });
});

describe('wall validation: zero-length walls', () => {
  it('throws on zero-length wall', () => {
    const yaml = BASE_YAML + `
  walls:
    segments:
      - id: w_zero
        floor: 1F
        from: { x: 500, y: 500 }
        to: { x: 500, y: 500 }
`;
    expect(() => resolve(parseArchilang(yaml))).toThrow('zero length');
  });
});

describe('wall validation: grid range', () => {
  const moduleSize = 910;
  const floorGrid = { x_spans: [3, 5], y_spans: [4, 3] };
  // maxGridX = 8, maxGridY = 7

  it('throws on grid x out of range (positive)', () => {
    const p: WallPointGrid = { grid: { x: 9, y: 0 } };
    expect(() => resolveWallPoint(p, moduleSize, floorGrid)).toThrow('out of range');
  });

  it('throws on grid y out of range (positive)', () => {
    const p: WallPointGrid = { grid: { x: 0, y: 8 } };
    expect(() => resolveWallPoint(p, moduleSize, floorGrid)).toThrow('out of range');
  });

  it('throws on negative grid x', () => {
    const p: WallPointGrid = { grid: { x: -1, y: 0 } };
    expect(() => resolveWallPoint(p, moduleSize, floorGrid)).toThrow('out of range');
  });

  it('allows boundary grid values (max)', () => {
    const p: WallPointGrid = { grid: { x: 8, y: 7 } };
    const result = resolveWallPoint(p, moduleSize, floorGrid);
    expect(result).toEqual({ x: 8 * 910, y: 7 * 910 });
  });
});

describe('wall validation: floor filter', () => {
  it('ignores segments with non-1F floor', () => {
    const yaml = BASE_YAML + `
  walls:
    segments:
      - id: w_2f
        floor: 2F
        from: { x: 0, y: 0 }
        to: { x: 1000, y: 0 }
`;
    const modelBase = resolve(parseArchilang(BASE_YAML));
    const model = resolve(parseArchilang(yaml));
    // 2F wall should be filtered out, same count as base
    expect(model.walls.length).toBe(modelBase.walls.length);
    expect(model.walls.find(w => w.id === 'w_2f')).toBeUndefined();
  });
});

describe('wall validation: ID uniqueness', () => {
  it('throws on duplicate explicit wall IDs with auto-extracted', () => {
    const yaml = BASE_YAML + `
  walls:
    segments:
      - id: wall_0
        floor: 1F
        from: { x: 500, y: 0 }
        to: { x: 500, y: 1000 }
`;
    expect(() => resolve(parseArchilang(yaml))).toThrow('Duplicate wall id');
  });
});
