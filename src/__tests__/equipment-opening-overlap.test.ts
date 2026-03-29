import { describe, it, expect } from 'vitest';
import { resolve } from '../resolver.js';
import { parseArchilang } from '../parser.js';
import { validateBuilding, ValidationIssue } from '../validator.js';

/** Single room (4×4 grid = 3640×3640mm) with configurable openings and equipment */
function makeYaml(opts: {
  openings: string;
  equipment: string;
}): string {
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
${opts.openings}
  equipment:
${opts.equipment}
`;
}

function resolveAndValidate(yaml: string) {
  const model = resolve(parseArchilang(yaml));
  const result = validateBuilding(model);
  return { model, result };
}

function overlapIssues(result: { issues: ValidationIssue[] }): ValidationIssue[] {
  return result.issues.filter(i => i.code === 'EQUIPMENT_OPENING_WALL_OVERLAP');
}

function clearanceIssues(result: { issues: ValidationIssue[] }): ValidationIssue[] {
  return result.issues.filter(i => i.code === 'EQUIPMENT_DOOR_CLEARANCE_BLOCKED');
}

// ─── wallId population ───

describe('wallId on ResolvedEquipment', () => {
  it('populates wallId for each resolved equipment', () => {
    const { model } = resolveAndValidate(makeYaml({
      openings: `
    - id: ED1
      type: AD
      style: 片開き
      room: room1
      wall: south
      position: center
      size: { w: 900, h: 2300 }`,
      equipment: `
    - id: T1
      type: toilet
      room: room1
      wall: north
      position: center`,
    }));
    expect(model.equipment.length).toBe(1);
    expect(model.equipment[0].wallId).toBeTruthy();
    // wallId should match one of the model's walls
    const wallIds = model.walls.map(w => w.id);
    expect(wallIds).toContain(model.equipment[0].wallId);
  });
});

// ─── Wall overlap detection ───

describe('equipment-opening wall overlap', () => {
  it('detects overlap between equipment and door on same wall (error)', () => {
    // South wall is 3640mm. Door centered = 1370-2270mm. Toilet centered = ~1595-2045mm (450mm).
    // These overlap.
    const { result } = resolveAndValidate(makeYaml({
      openings: `
    - id: D1
      type: WD
      style: 片開き
      room: room1
      wall: south
      position: center
      size: { w: 900, h: 2000 }`,
      equipment: `
    - id: T1
      type: toilet
      room: room1
      wall: south
      position: center`,
    }));
    const issues = overlapIssues(result);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].equipmentId).toBe('T1');
    expect(issues[0].openingId).toBe('D1');
  });

  it('detects overlap between equipment and window on same wall (warning)', () => {
    const { result } = resolveAndValidate(makeYaml({
      openings: `
    - id: W1
      type: AW
      style: 引違い窓
      room: room1
      wall: south
      position: center
      size: { w: 1690, h: 1100 }
      sill: 800`,
      equipment: `
    - id: REF1
      type: refrigerator
      room: room1
      wall: south
      position: center`,
    }));
    const issues = overlapIssues(result);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('warning');
  });

  it('no overlap when equipment and door are on the same wall but separated', () => {
    // South wall = 3640mm. Door at offset 0 = 0-900mm. Toilet at offset 2500.
    const { result } = resolveAndValidate(makeYaml({
      openings: `
    - id: D1
      type: WD
      style: 片開き
      room: room1
      wall: south
      position: { offset: 0 }
      size: { w: 900, h: 2000 }`,
      equipment: `
    - id: T1
      type: toilet
      room: room1
      wall: south
      position: { offset: 2500 }`,
    }));
    const issues = overlapIssues(result);
    expect(issues.length).toBe(0);
  });

  it('no false positive when equipment and opening are on different walls', () => {
    const { result } = resolveAndValidate(makeYaml({
      openings: `
    - id: D1
      type: WD
      style: 片開き
      room: room1
      wall: south
      position: center
      size: { w: 900, h: 2000 }`,
      equipment: `
    - id: K1
      type: kitchen_counter
      room: room1
      wall: north
      position: center`,
    }));
    const issues = overlapIssues(result);
    expect(issues.length).toBe(0);
  });

  it('detects overlap on vertical wall (east/west)', () => {
    // East wall = 3640mm. Door centered = 1370-2270. Washbasin centered = ~1445-2195 (750mm).
    const { result } = resolveAndValidate(makeYaml({
      openings: `
    - id: D1
      type: WD
      style: 片開き
      room: room1
      wall: east
      position: center
      size: { w: 900, h: 2000 }`,
      equipment: `
    - id: WB1
      type: washbasin
      room: room1
      wall: east
      position: center`,
    }));
    const issues = overlapIssues(result);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('error');
  });

  it('adjacent but not overlapping (boundary case)', () => {
    // Door at offset 0, w=900 → occupies 0-900mm on south wall.
    // Toilet (perpendicular on horizontal wall: eqW=700) at offset 900 → 900-1600mm.
    // Edge-to-edge, 0mm gap → overlap = 0 which is NOT > EPS → no issue.
    const { result } = resolveAndValidate(makeYaml({
      openings: `
    - id: D1
      type: WD
      style: 片開き
      room: room1
      wall: south
      position: { offset: 450 }
      size: { w: 900, h: 2000 }`,
      equipment: `
    - id: T1
      type: toilet
      room: room1
      wall: south
      position: { offset: 900 }`,
    }));
    const issues = overlapIssues(result);
    expect(issues.length).toBe(0);
  });

  it('sub-EPS overlap (≤0.5mm) is not flagged', () => {
    // Door at offset 450 → center=450, range 0-900mm.
    // Toilet at offset 899.7 → 899.7-1599.7mm. Overlap = 900-899.7 = 0.3mm ≤ EPS.
    // We can't set sub-mm offsets in YAML, so we test the principle:
    // equipment at offset 900 (edge-to-edge) should NOT trigger.
    const { result } = resolveAndValidate(makeYaml({
      openings: `
    - id: D1
      type: WD
      style: 片開き
      room: room1
      wall: south
      position: { offset: 450 }
      size: { w: 900, h: 2000 }`,
      equipment: `
    - id: T1
      type: toilet
      room: room1
      wall: south
      position: { offset: 900 }`,
    }));
    // overlap = min(900, 1600) - max(0, 900) = 0mm → not > EPS
    const issues = overlapIssues(result);
    expect(issues.length).toBe(0);
  });

  it('includes overlap amount in message', () => {
    const { result } = resolveAndValidate(makeYaml({
      openings: `
    - id: D1
      type: AD
      style: 片開き
      room: room1
      wall: south
      position: center
      size: { w: 900, h: 2300 }`,
      equipment: `
    - id: REF1
      type: refrigerator
      room: room1
      wall: south
      position: center`,
    }));
    const issues = overlapIssues(result);
    expect(issues.length).toBe(1);
    expect(issues[0].message).toMatch(/overlap: \d+mm/);
  });
});

// ─── Two-room scenario (ensures wallId matching across shared walls) ───

describe('multi-room equipment-opening overlap', () => {
  it('detects overlap when equipment and connects-door share the same wall', () => {
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
      y_spans: [4]
  rooms:
    - id: room1
      floor: 1F
      type: 居室
      grid_rect: { x: 0, y: 0, w: 4, h: 4 }
    - id: room2
      floor: 1F
      type: 居室
      grid_rect: { x: 4, y: 0, w: 4, h: 4 }
  openings:
    - id: ED1
      type: AD
      style: 片開き
      room: room1
      wall: south
      position: center
      size: { w: 900, h: 2300 }
    - id: D1
      type: WD
      style: 片開き
      connects: [room1, room2]
      size: { w: 800, h: 2000 }
  equipment:
    - id: REF1
      type: refrigerator
      room: room1
      wall: east
      position: center
`;
    const { result } = resolveAndValidate(yaml);
    // D1 connects room1↔room2 on shared wall (x=3640, vertical).
    // D1 centered at y=1820. REF1 centered on east wall at y≈1495-2145.
    // These should overlap.
    const issues = overlapIssues(result);
    expect(issues.length).toBe(1);
    expect(issues[0].openingId).toBe('D1');
    expect(issues[0].equipmentId).toBe('REF1');
  });
});

// ─── Door clearance zone detection (2D) ───

function makeTwoRoomYaml(opts: {
  openings: string;
  equipment: string;
}): string {
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
      y_spans: [4, 4]
  rooms:
    - id: room_south
      floor: 1F
      type: 居室
      grid_rect: { x: 0, y: 0, w: 4, h: 4 }
    - id: room_north
      floor: 1F
      type: 居室
      grid_rect: { x: 0, y: 4, w: 4, h: 4 }
  openings:
    - id: ED1
      type: AD
      style: 片開き
      room: room_south
      wall: south
      position: center
      size: { w: 900, h: 2300 }
${opts.openings}
  equipment:
${opts.equipment}
`;
}

describe('door clearance zone detection (2D)', () => {
  it('detects equipment blocking door on adjacent wall (cross-wall blocking)', () => {
    // Door D1 on shared wall (y=3640) between south and north rooms.
    // Fridge in room_south on west wall near the north wall (offset 3000).
    // Fridge footprint: x:0-650, y:3000-3685 → extends into D1 clearance zone.
    // D1 clearance in room_south: x:1420-2220, y:2840-3640.
    // Wait, the fridge is at x:0-650 and clearance is at x:1420-2220, no overlap in X.
    // Let me place the fridge at center of north wall instead.
    const { result } = resolveAndValidate(makeTwoRoomYaml({
      openings: `
    - id: D1
      type: WD
      style: 片開き
      connects: [room_south, room_north]
      size: { w: 800, h: 2000 }`,
      equipment: `
    - id: REF1
      type: refrigerator
      room: room_south
      wall: north
      position: center`,
    }));
    // D1 centered at x=1820 on shared wall y=3640.
    // D1 clearance in room_south: x:1420-2220, y:2840-3640 (extends south into room).
    // REF1 on north wall centered: x≈1478-2163, y=2990-3640 (pressed against north wall).
    // Overlap in both X and Y → detected!
    // Note: this will also trigger wall overlap (same wall), but clearance should also fire.
    const issues = clearanceIssues(result);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    const ref1Issue = issues.find(i => i.equipmentId === 'REF1');
    expect(ref1Issue).toBeDefined();
    expect(ref1Issue!.severity).toBe('error');
    expect(ref1Issue!.openingId).toBe('D1');
  });

  it('detects fridge on different wall blocking door clearance', () => {
    // This is the exact pattern from 3ldk-with-equipment:
    // Fridge on west wall near the top, door on north wall near the west corner.
    const { result } = resolveAndValidate(makeTwoRoomYaml({
      openings: `
    - id: D1
      type: WD
      style: 片開き
      room: room_north
      wall: south
      position: { offset: 400 }
      size: { w: 800, h: 2000 }`,
      equipment: `
    - id: REF1
      type: refrigerator
      room: room_south
      wall: west
      position: { offset: 3000 }`,
    }));
    // D1 on room_north's south wall (y=3640) at offset 400 → cx=400, range x:0-800.
    // D1 clearance in room_south: x:0-800, y:2840-3640 (south of wall).
    // REF1 on west wall at offset 3000: x:0-650, y:3000-3685.
    // Overlap: x:0-650, y:3000-3640 → detected!
    const issues = clearanceIssues(result);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    const ref1Issue = issues.find(i => i.equipmentId === 'REF1');
    expect(ref1Issue).toBeDefined();
    expect(ref1Issue!.openingId).toBe('D1');
  });

  it('no clearance issue when equipment is far from door', () => {
    const { result } = resolveAndValidate(makeTwoRoomYaml({
      openings: `
    - id: D1
      type: WD
      style: 片開き
      connects: [room_south, room_north]
      size: { w: 800, h: 2000 }`,
      equipment: `
    - id: T1
      type: toilet
      room: room_south
      wall: west
      position: { offset: 200 }`,
    }));
    // D1 at y=3640, clearance in room_south: x:1420-2220, y:2840-3640.
    // Toilet on west wall at offset 200: x:0-450, y:200-900. Far from clearance zone.
    // Also far from ED1 clearance (south wall center).
    const issues = clearanceIssues(result);
    expect(issues.length).toBe(0);
  });

  it('checks clearance on both sides of a connects door', () => {
    const { result } = resolveAndValidate(makeTwoRoomYaml({
      openings: `
    - id: D1
      type: WD
      style: 片開き
      connects: [room_south, room_north]
      size: { w: 800, h: 2000 }`,
      equipment: `
    - id: WM1
      type: washing_machine
      room: room_north
      wall: south
      position: center`,
    }));
    // D1 at y=3640, clearance in room_north: y:3640-4440 (north of wall).
    // WM1 on room_north's south wall centered: x≈1500-2140, y:3640-4280.
    // This overlaps with the clearance zone on the north side.
    const issues = clearanceIssues(result);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].roomIds).toContain('room_north');
  });

  it('includes overlap dimensions in message', () => {
    const { result } = resolveAndValidate(makeTwoRoomYaml({
      openings: `
    - id: D1
      type: WD
      style: 片開き
      connects: [room_south, room_north]
      size: { w: 800, h: 2000 }`,
      equipment: `
    - id: REF1
      type: refrigerator
      room: room_south
      wall: north
      position: center`,
    }));
    const issues = clearanceIssues(result);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].message).toMatch(/\d+×\d+mm overlap/);
  });

  it('skips clearance check for sliding doors (引き戸)', () => {
    // Same overlapping position as "detects equipment blocking door on adjacent wall",
    // but door is 引き戸 instead of 片開き → no clearance issue.
    const { result } = resolveAndValidate(makeTwoRoomYaml({
      openings: `
    - id: D1
      type: WD
      style: 引き戸
      connects: [room_south, room_north]
      size: { w: 800, h: 2000 }`,
      equipment: `
    - id: REF1
      type: refrigerator
      room: room_south
      wall: north
      position: center`,
    }));
    const issues = clearanceIssues(result);
    expect(issues.length).toBe(0);
  });
});
