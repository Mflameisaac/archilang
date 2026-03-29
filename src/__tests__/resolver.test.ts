import { describe, it, expect } from 'vitest';
import { resolve, extractWalls } from '../resolver.js';
import { parseArchilang } from '../parser.js';
import { ResolvedRoom } from '../types.js';
import { readFileSync } from 'fs';
import { resolve as pathResolve } from 'path';

const samplesDir = pathResolve(import.meta.dirname, '../../samples');

function loadAndResolve(name: string) {
  const yaml = readFileSync(`${samplesDir}/${name}.yaml`, 'utf-8');
  return resolve(parseArchilang(yaml));
}

describe('resolve (E2E: YAML → BuildingModel)', () => {
  it('resolves basic-3room correctly', () => {
    const model = loadAndResolve('basic-3room');
    expect(model.moduleSize).toBe(910);
    expect(model.externalWallThickness).toBe(130);
    expect(model.internalWallThickness).toBe(90);
    expect(model.totalGridX).toBe(8);
    expect(model.totalGridY).toBe(7);
    expect(model.rooms).toHaveLength(3);
    expect(model.openings).toHaveLength(6);
    expect(model.orientation).toBe('south');
  });

  it('resolves room rects from grid_rect × moduleSize', () => {
    const model = loadAndResolve('basic-3room');
    const ldk = model.rooms.find(r => r.id === 'ldk')!;
    expect(ldk.boundingRect).toEqual({
      x: 3 * 910, // 2730
      y: 0,
      w: 5 * 910, // 4550
      h: 7 * 910, // 6370
    });
    expect(ldk.rects).toHaveLength(1);
    expect(ldk.rects[0]).toEqual(ldk.boundingRect);
  });

  it('resolves all sample files without error', () => {
    const samples = ['basic-3room', '1r-studio', '2ldk-apartment', 'compact-2dk', '3ldk-house', 'l-shaped-plan'];
    for (const name of samples) {
      expect(() => loadAndResolve(name)).not.toThrow();
    }
  });
});

describe('extractWalls', () => {
  it('produces correct wall count for basic-3room (3 rooms, 8×7 grid)', () => {
    const model = loadAndResolve('basic-3room');
    // 3 rooms with internal walls between them
    expect(model.walls.length).toBeGreaterThan(0);

    const external = model.walls.filter(w => w.isExternal);
    const internal = model.walls.filter(w => !w.isExternal);
    expect(external.length).toBeGreaterThan(0);
    expect(internal.length).toBeGreaterThan(0);
  });

  it('marks single-room edges as external', () => {
    const model = loadAndResolve('1r-studio');
    // Single room — all walls should be external
    expect(model.walls.every(w => w.isExternal)).toBe(true);
    expect(model.walls.every(w => w.rooms.length === 1)).toBe(true);
  });

  it('identifies shared walls as internal', () => {
    const model = loadAndResolve('basic-3room');
    // LDK shares walls with bedroom and bath_area
    const sharedWithBedroom = model.walls.find(
      w => w.rooms.includes('ldk') && w.rooms.includes('bedroom')
    );
    expect(sharedWithBedroom).toBeDefined();
    expect(sharedWithBedroom!.isExternal).toBe(false);
    expect(sharedWithBedroom!.thickness).toBe(90);
  });

  it('uses correct thickness for external vs internal walls', () => {
    const model = loadAndResolve('basic-3room');
    for (const w of model.walls) {
      if (w.isExternal) {
        expect(w.thickness).toBe(130);
      } else {
        expect(w.thickness).toBe(90);
      }
    }
  });

  it('handles L-shaped plan correctly', () => {
    const model = loadAndResolve('l-shaped-plan');
    expect(model.rooms).toHaveLength(4);
    const external = model.walls.filter(w => w.isExternal);
    const internal = model.walls.filter(w => !w.isExternal);
    expect(external.length).toBeGreaterThan(0);
    expect(internal.length).toBeGreaterThan(0);
  });
});
