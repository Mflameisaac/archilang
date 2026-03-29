import { describe, it, expect } from 'vitest';
import { resolve } from '../resolver.js';
import { parseArchilang } from '../parser.js';
import { validateBuilding } from '../validator.js';
import { composeSvg } from '../svg-composer.js';
import { EQUIPMENT_PRESETS } from '../equipment-presets.js';
import { Archilang, EquipmentType, WallSide } from '../types.js';

/** Minimal YAML with a single room for equipment testing */
function makeYaml(equipment: string): string {
  return `
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
      type: 居室
      grid_rect: { x: 0, y: 0, w: 4, h: 4 }
  openings:
    - id: ED1
      type: AD
      style: 片開き
      room: room1
      wall: south
      position: center
      size: { w: 900, h: 2300 }
  equipment:
${equipment}
`;
}

function resolveYaml(yaml: string) {
  return resolve(parseArchilang(yaml));
}

describe('equipment presets', () => {
  it('all equipment types have valid presets', () => {
    const types: EquipmentType[] = [
      'kitchen_counter', 'unit_bath', 'toilet', 'washbasin', 'washing_machine', 'refrigerator',
    ];
    for (const t of types) {
      expect(EQUIPMENT_PRESETS[t]).toBeDefined();
      expect(EQUIPMENT_PRESETS[t].defaultSize.w).toBeGreaterThan(0);
      expect(EQUIPMENT_PRESETS[t].defaultSize.h).toBeGreaterThan(0);
    }
  });
});

describe('equipment parser validation', () => {
  it('rejects unknown equipment type', () => {
    expect(() => resolveYaml(makeYaml(`
    - id: X1
      type: microwave
      room: room1
      wall: south
      position: center
    `))).toThrow(/unknown type/);
  });

  it('rejects missing room field', () => {
    expect(() => resolveYaml(makeYaml(`
    - id: X1
      type: toilet
      wall: south
      position: center
    `))).toThrow(/missing "room"/);
  });

  it('rejects invalid wall', () => {
    expect(() => resolveYaml(makeYaml(`
    - id: X1
      type: toilet
      room: room1
      wall: northeast
      position: center
    `))).toThrow(/invalid wall/);
  });

  it('rejects duplicate equipment ID', () => {
    expect(() => resolveYaml(makeYaml(`
    - id: T1
      type: toilet
      room: room1
      wall: south
      position: center
    - id: T1
      type: washbasin
      room: room1
      wall: north
      position: center
    `))).toThrow(/Duplicate equipment ID/);
  });
});

describe('equipment resolution', () => {
  it('resolves center-positioned equipment on south wall', () => {
    const model = resolveYaml(makeYaml(`
    - id: T1
      type: toilet
      room: room1
      wall: south
      position: center
    `));
    expect(model.equipment).toHaveLength(1);
    const eq = model.equipment[0];
    expect(eq.id).toBe('T1');
    expect(eq.type).toBe('toilet');
    expect(eq.wallSide).toBe('south');
    // Toilet preset: w=450 (along wall), h=700 (depth into room)
    // South wall is horizontal: eqW=450, eqH=700
    expect(eq.w).toBe(450);
    expect(eq.h).toBe(700);
    expect(eq.roomId).toBe('room1');
    expect(eq.y).toBe(0); // south wall = room bottom
  });

  it('resolves equipment on all four walls', () => {
    const walls: WallSide[] = ['south', 'north', 'east', 'west'];
    for (const wall of walls) {
      const model = resolveYaml(makeYaml(`
    - id: WB1
      type: washbasin
      room: room1
      wall: ${wall}
      position: center
      `));
      expect(model.equipment).toHaveLength(1);
      expect(model.equipment[0].wallSide).toBe(wall);
    }
  });

  it('resolves offset position', () => {
    const model = resolveYaml(makeYaml(`
    - id: K1
      type: kitchen_counter
      room: room1
      wall: south
      position: { offset: 200 }
    `));
    const eq = model.equipment[0];
    // room starts at x=0, so eq.x = 0 + 200 = 200
    expect(eq.x).toBe(200);
  });

  it('applies size override', () => {
    const model = resolveYaml(makeYaml(`
    - id: K1
      type: kitchen_counter
      room: room1
      wall: south
      position: center
      size: { w: 1800, h: 600 }
    `));
    const eq = model.equipment[0];
    // along orientation: alongWall=w=1800, depth=h=600
    // horizontal wall: eqW=1800, eqH=600
    expect(eq.w).toBe(1800);
    expect(eq.h).toBe(600);
  });

  it('throws on unknown room reference', () => {
    expect(() => resolveYaml(makeYaml(`
    - id: T1
      type: toilet
      room: nonexistent
      wall: south
      position: center
    `))).toThrow(/room "nonexistent" not found/);
  });

  it('resolves empty equipment array', () => {
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
      x_spans: [4]
      y_spans: [4]
  rooms:
    - id: room1
      floor: 1F
      type: 居室
      grid_rect: { x: 0, y: 0, w: 4, h: 4 }
  openings:
    - id: ED1
      type: AD
      style: 片開き
      room: room1
      wall: south
      position: center
      size: { w: 900, h: 2300 }
`;
    const model = resolveYaml(yaml);
    expect(model.equipment).toHaveLength(0);
  });
});

describe('equipment validation', () => {
  it('warns when equipment extends outside room', () => {
    // Place a large kitchen counter with offset that pushes it out
    const model = resolveYaml(makeYaml(`
    - id: K1
      type: kitchen_counter
      room: room1
      wall: south
      position: { offset: 3000 }
    `));
    const result = validateBuilding(model);
    const outOfBounds = result.issues.filter(i => i.code === 'EQUIPMENT_OUT_OF_BOUNDS');
    expect(outOfBounds.length).toBeGreaterThan(0);
  });

  it('warns when equipment items overlap', () => {
    const model = resolveYaml(makeYaml(`
    - id: T1
      type: toilet
      room: room1
      wall: south
      position: center
    - id: T2
      type: toilet
      room: room1
      wall: south
      position: center
    `));
    const result = validateBuilding(model);
    const overlaps = result.issues.filter(i => i.code === 'EQUIPMENT_OVERLAP');
    expect(overlaps.length).toBeGreaterThan(0);
  });
});

describe('equipment SVG rendering', () => {
  it('produces SVG with equipment group', () => {
    const model = resolveYaml(makeYaml(`
    - id: K1
      type: kitchen_counter
      room: room1
      wall: south
      position: center
    `));
    const svg = composeSvg(model);
    expect(svg).toContain('id="equipment"');
    expect(svg).toContain('equipment-kitchen_counter');
    expect(svg).toContain('data-id="K1"');
  });

  it('renders all equipment types without error', () => {
    const types: EquipmentType[] = [
      'kitchen_counter', 'unit_bath', 'toilet', 'washbasin', 'washing_machine', 'refrigerator',
    ];
    for (const type of types) {
      const model = resolveYaml(makeYaml(`
    - id: EQ1
      type: ${type}
      room: room1
      wall: south
      position: center
      `));
      expect(() => composeSvg(model)).not.toThrow();
    }
  });
});
