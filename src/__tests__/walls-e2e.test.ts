import { describe, it, expect } from 'vitest';
import { resolve } from '../resolver.js';
import { parseArchilang } from '../parser.js';
import { composeSvg } from '../svg-composer.js';
import { readFileSync } from 'fs';
import { resolve as pathResolve } from 'path';

const samplesDir = pathResolve(import.meta.dirname, '../../samples');

function loadAndResolve(name: string) {
  const yaml = readFileSync(`${samplesDir}/${name}.yaml`, 'utf-8');
  return resolve(parseArchilang(yaml));
}

describe('custom-walls-invalid sample E2E', () => {
  it('resolves without error', () => {
    const model = loadAndResolve('custom-walls-invalid');
    expect(model.rooms).toHaveLength(2);
    expect(model.openings).toHaveLength(3);
  });

  it('contains all 3 explicit walls', () => {
    const model = loadAndResolve('custom-walls-invalid');
    const explicit = model.walls.filter(w =>
      ['w_partition', 'w_offset_wall', 'w_custom_ext'].includes(w.id)
    );
    expect(explicit).toHaveLength(3);
  });

  it('resolves w_partition at correct mm coordinates', () => {
    const model = loadAndResolve('custom-walls-invalid');
    const w = model.walls.find(w => w.id === 'w_partition')!;
    expect(w.x1).toBe(1820);
    expect(w.y1).toBe(0);
    expect(w.x2).toBe(1820);
    expect(w.y2).toBe(3640);
    expect(w.isExternal).toBe(false);
    expect(w.thickness).toBe(90);
  });

  it('resolves w_offset_wall with grid+offset', () => {
    const model = loadAndResolve('custom-walls-invalid');
    const w = model.walls.find(w => w.id === 'w_offset_wall')!;
    expect(w.x1).toBe(4 * 910 + 1500); // 3790
    expect(w.y1).toBe(4 * 910);       // 3640
    expect(w.x2).toBe(4 * 910 + 1500); // 3790
    expect(w.y2).toBe(7 * 910);       // 6370
    expect(w.isExternal).toBe(false);
  });

  it('contains auto-extracted walls alongside explicit walls', () => {
    const model = loadAndResolve('custom-walls-invalid');
    const autoWalls = model.walls.filter(w => w.id.startsWith('wall_'));
    expect(autoWalls.length).toBeGreaterThan(0);
  });

  it('renders to SVG without error', () => {
    const model = loadAndResolve('custom-walls-invalid');
    const svg = composeSvg(model);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg.length).toBeGreaterThan(100);
  });

  it('existing samples still render correctly (regression)', () => {
    const samples = ['basic-3room', '1r-studio', '2ldk-apartment', 'compact-2dk', '3ldk-house', 'l-shaped-plan'];
    for (const name of samples) {
      const model = loadAndResolve(name);
      const svg = composeSvg(model);
      expect(svg).toContain('<svg');
    }
  });
});
