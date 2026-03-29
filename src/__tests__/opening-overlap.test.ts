import { describe, it, expect } from 'vitest';
import { resolve } from '../resolver.js';
import { parseArchilang } from '../parser.js';
import { validateBuilding } from '../validator.js';

function makeYaml(openings: string): string {
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
      x_spans: [6]
      y_spans: [4]
  rooms:
    - id: room1
      floor: 1F
      type: Room
      grid_rect: { x: 0, y: 0, w: 6, h: 4 }
  openings:
${openings}
`;
}

describe('OPENING_OVERLAP detection', () => {
  it('no issue when two openings on same wall do not overlap', () => {
    const yaml = makeYaml(`
    - id: W1
      type: AW
      style: 引違い窓
      room: room1
      wall: south
      position: { offset: 500 }
      size: { w: 800, h: 1100 }
    - id: W2
      type: AW
      style: 引違い窓
      room: room1
      wall: south
      position: { offset: 3000 }
      size: { w: 800, h: 1100 }
`);
    const model = resolve(parseArchilang(yaml));
    const result = validateBuilding(model);
    const overlaps = result.issues.filter(i => i.code === 'OPENING_OVERLAP');
    expect(overlaps).toHaveLength(0);
  });

  it('detects overlap when two openings on same wall overlap', () => {
    const yaml = makeYaml(`
    - id: W1
      type: AW
      style: 引違い窓
      room: room1
      wall: south
      position: { offset: 1000 }
      size: { w: 1200, h: 1100 }
    - id: W2
      type: AW
      style: 引違い窓
      room: room1
      wall: south
      position: { offset: 1800 }
      size: { w: 1200, h: 1100 }
`);
    const model = resolve(parseArchilang(yaml));
    const result = validateBuilding(model);
    const overlaps = result.issues.filter(i => i.code === 'OPENING_OVERLAP');
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].severity).toBe('warning');
  });

  it('no issue when openings are on different walls', () => {
    const yaml = makeYaml(`
    - id: W1
      type: AW
      style: 引違い窓
      room: room1
      wall: south
      position: center
      size: { w: 1200, h: 1100 }
    - id: W2
      type: AW
      style: 引違い窓
      room: room1
      wall: north
      position: center
      size: { w: 1200, h: 1100 }
`);
    const model = resolve(parseArchilang(yaml));
    const result = validateBuilding(model);
    const overlaps = result.issues.filter(i => i.code === 'OPENING_OVERLAP');
    expect(overlaps).toHaveLength(0);
  });

  it('detects nested (contained) overlap', () => {
    // Large window contains small door
    const yaml = makeYaml(`
    - id: W_big
      type: AW
      style: FIX窓
      room: room1
      wall: south
      position: center
      size: { w: 3000, h: 2000 }
    - id: W_small
      type: AW
      style: 引違い窓
      room: room1
      wall: south
      position: center
      size: { w: 800, h: 1100 }
`);
    const model = resolve(parseArchilang(yaml));
    const result = validateBuilding(model);
    const overlaps = result.issues.filter(i => i.code === 'OPENING_OVERLAP');
    expect(overlaps).toHaveLength(1);
  });

  it('detects overlap among three openings where middle two overlap', () => {
    const yaml = makeYaml(`
    - id: W1
      type: AW
      style: 引違い窓
      room: room1
      wall: south
      position: { offset: 500 }
      size: { w: 800, h: 1100 }
    - id: W2
      type: AW
      style: 引違い窓
      room: room1
      wall: south
      position: { offset: 2000 }
      size: { w: 1200, h: 1100 }
    - id: W3
      type: AW
      style: 引違い窓
      room: room1
      wall: south
      position: { offset: 2800 }
      size: { w: 1200, h: 1100 }
`);
    const model = resolve(parseArchilang(yaml));
    const result = validateBuilding(model);
    const overlaps = result.issues.filter(i => i.code === 'OPENING_OVERLAP');
    expect(overlaps.length).toBeGreaterThanOrEqual(1);
  });
});
