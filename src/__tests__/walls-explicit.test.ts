import { describe, it, expect } from 'vitest';
import { resolve } from '../resolver.js';
import { parseArchilang } from '../parser.js';

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

function yamlWithWalls(wallsSection: string) {
  return BASE_YAML + wallsSection;
}

describe('walls.segments (mm coordinate explicit walls)', () => {
  it('produces same result when walls section is absent', () => {
    const modelWithout = resolve(parseArchilang(BASE_YAML));
    // No walls section → auto-extracted walls only
    expect(modelWithout.walls.length).toBeGreaterThan(0);
  });

  it('produces same result when walls.segments is empty', () => {
    const modelWithout = resolve(parseArchilang(BASE_YAML));
    const modelWith = resolve(parseArchilang(yamlWithWalls(`
  walls:
    segments: []
`)));
    expect(modelWith.walls.length).toBe(modelWithout.walls.length);
  });

  it('adds an explicit wall segment specified in mm', () => {
    const model = resolve(parseArchilang(yamlWithWalls(`
  walls:
    segments:
      - id: w_custom1
        floor: 1F
        from: { x: 2730, y: 0 }
        to: { x: 2730, y: 3640 }
        thickness: 130mm
        type: external
`)));
    const custom = model.walls.find(w => w.id === 'w_custom1');
    expect(custom).toBeDefined();
    expect(custom!.x1).toBe(2730);
    expect(custom!.y1).toBe(0);
    expect(custom!.x2).toBe(2730);
    expect(custom!.y2).toBe(3640);
    expect(custom!.isExternal).toBe(true);
    expect(custom!.thickness).toBe(130);
  });

  it('uses default external wall thickness when thickness is omitted', () => {
    const model = resolve(parseArchilang(yamlWithWalls(`
  walls:
    segments:
      - id: w_default_thick
        floor: 1F
        from: { x: 1000, y: 0 }
        to: { x: 1000, y: 2000 }
`)));
    const custom = model.walls.find(w => w.id === 'w_default_thick');
    expect(custom).toBeDefined();
    // Default thickness = external_wall.thickness = 130mm
    expect(custom!.thickness).toBe(130);
  });

  it('defaults to external type when type is omitted', () => {
    const model = resolve(parseArchilang(yamlWithWalls(`
  walls:
    segments:
      - id: w_default_type
        floor: 1F
        from: { x: 500, y: 0 }
        to: { x: 500, y: 1000 }
`)));
    const custom = model.walls.find(w => w.id === 'w_default_type');
    expect(custom).toBeDefined();
    expect(custom!.isExternal).toBe(true);
  });

  it('supports internal wall type', () => {
    const model = resolve(parseArchilang(yamlWithWalls(`
  walls:
    segments:
      - id: w_internal
        floor: 1F
        from: { x: 1500, y: 0 }
        to: { x: 1500, y: 3000 }
        thickness: 90mm
        type: internal
`)));
    const custom = model.walls.find(w => w.id === 'w_internal');
    expect(custom).toBeDefined();
    expect(custom!.isExternal).toBe(false);
    expect(custom!.thickness).toBe(90);
  });

  it('uses internal wall default thickness for internal type when thickness omitted', () => {
    const model = resolve(parseArchilang(yamlWithWalls(`
  walls:
    segments:
      - id: w_int_default
        floor: 1F
        from: { x: 1500, y: 0 }
        to: { x: 1500, y: 3000 }
        type: internal
`)));
    const custom = model.walls.find(w => w.id === 'w_int_default');
    expect(custom).toBeDefined();
    expect(custom!.isExternal).toBe(false);
    expect(custom!.thickness).toBe(90);
  });

  it('sets correct side for vertical walls', () => {
    const model = resolve(parseArchilang(yamlWithWalls(`
  walls:
    segments:
      - id: w_vert
        floor: 1F
        from: { x: 2000, y: 0 }
        to: { x: 2000, y: 3000 }
`)));
    const custom = model.walls.find(w => w.id === 'w_vert');
    expect(custom).toBeDefined();
    // Vertical wall (same x) → side should be east or west
    expect(['east', 'west']).toContain(custom!.side);
  });

  it('sets correct side for horizontal walls', () => {
    const model = resolve(parseArchilang(yamlWithWalls(`
  walls:
    segments:
      - id: w_horiz
        floor: 1F
        from: { x: 0, y: 1500 }
        to: { x: 3000, y: 1500 }
`)));
    const custom = model.walls.find(w => w.id === 'w_horiz');
    expect(custom).toBeDefined();
    // Horizontal wall (same y) → side should be north or south
    expect(['north', 'south']).toContain(custom!.side);
  });

  it('coexists with auto-extracted walls', () => {
    const modelBase = resolve(parseArchilang(BASE_YAML));
    const baseCount = modelBase.walls.length;

    const model = resolve(parseArchilang(yamlWithWalls(`
  walls:
    segments:
      - id: w_extra
        floor: 1F
        from: { x: 1500, y: 0 }
        to: { x: 1500, y: 2000 }
`)));
    // Should have all auto-extracted walls + 1 explicit wall
    expect(model.walls.length).toBe(baseCount + 1);
  });
});
