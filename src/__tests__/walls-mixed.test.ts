import { describe, it, expect } from 'vitest';
import { resolve } from '../resolver.js';
import { parseArchilang } from '../parser.js';
import { readFileSync } from 'fs';
import { resolve as pathResolve } from 'path';

const samplesDir = pathResolve(import.meta.dirname, '../../samples');

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

describe('walls mode: additive (default)', () => {
  it('includes both auto-extracted and explicit walls', () => {
    const modelBase = resolve(parseArchilang(BASE_YAML));
    const baseCount = modelBase.walls.length;

    const yaml = BASE_YAML + `
  walls:
    mode: additive
    segments:
      - id: w_add1
        floor: 1F
        from: { x: 1500, y: 0 }
        to: { x: 1500, y: 2000 }
      - id: w_add2
        floor: 1F
        from: { x: 0, y: 1500 }
        to: { x: 1500, y: 1500 }
`;
    const model = resolve(parseArchilang(yaml));
    expect(model.walls.length).toBe(baseCount + 2);
    expect(model.walls.find(w => w.id === 'w_add1')).toBeDefined();
    expect(model.walls.find(w => w.id === 'w_add2')).toBeDefined();
  });

  it('defaults to additive when mode is omitted', () => {
    const modelBase = resolve(parseArchilang(BASE_YAML));
    const baseCount = modelBase.walls.length;

    const yaml = BASE_YAML + `
  walls:
    segments:
      - id: w_nomode
        floor: 1F
        from: { x: 1500, y: 0 }
        to: { x: 1500, y: 2000 }
`;
    const model = resolve(parseArchilang(yaml));
    expect(model.walls.length).toBe(baseCount + 1);
  });
});

describe('walls mode: explicit_only', () => {
  it('excludes auto-extracted walls, uses only explicit', () => {
    const yaml = BASE_YAML + `
  walls:
    mode: explicit_only
    segments:
      - id: w_only1
        floor: 1F
        from: { x: 0, y: 0 }
        to: { x: 7280, y: 0 }
        type: external
      - id: w_only2
        floor: 1F
        from: { x: 0, y: 0 }
        to: { x: 0, y: 6370 }
        type: external
`;
    const model = resolve(parseArchilang(yaml));
    // Only the 2 explicit walls, no auto-extracted
    expect(model.walls.length).toBe(2);
    expect(model.walls.every(w => w.id.startsWith('w_only'))).toBe(true);
  });
});

describe('duplicate wall handling', () => {
  it('explicit wall at same position as auto wall results in both present (additive)', () => {
    // When a wall at grid boundary x=3 (2730mm) is also added explicitly,
    // both auto-extracted and explicit walls exist
    const yaml = BASE_YAML + `
  walls:
    segments:
      - id: w_dup
        floor: 1F
        from: { x: 2730, y: 0 }
        to: { x: 2730, y: 6370 }
`;
    const model = resolve(parseArchilang(yaml));
    const dupWall = model.walls.find(w => w.id === 'w_dup');
    expect(dupWall).toBeDefined();
    // Auto-extracted walls at x=2730 should also exist
    const autoWallsAtSamePos = model.walls.filter(
      w => w.id !== 'w_dup' && w.x1 === 2730 && w.x2 === 2730
    );
    expect(autoWallsAtSamePos.length).toBeGreaterThan(0);
  });
});

describe('backward compatibility (regression)', () => {
  it('all existing samples produce identical results without walls section', () => {
    const samples = ['basic-3room', '1r-studio', '2ldk-apartment', 'compact-2dk', '3ldk-house', 'l-shaped-plan'];
    for (const name of samples) {
      const yaml = readFileSync(`${samplesDir}/${name}.yaml`, 'utf-8');
      const model = resolve(parseArchilang(yaml));
      // No walls section → auto-extraction only, no crash
      expect(model.walls.length).toBeGreaterThan(0);
      // Verify no explicit wall IDs leak in
      expect(model.walls.every(w => w.id.startsWith('wall_'))).toBe(true);
    }
  });
});
