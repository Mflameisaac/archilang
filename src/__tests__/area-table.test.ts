import { describe, it, expect } from 'vitest';
import { parseArchilang } from '../parser.js';
import { resolve } from '../resolver.js';
import { computeAreaSummary, areaSummaryToJson } from '../area-table.js';
import { composeSvg } from '../svg-composer.js';
import { readFileSync } from 'node:fs';
import { resolve as pathResolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSample(name: string) {
  const yaml = readFileSync(pathResolve(__dirname, '..', '..', 'samples', name), 'utf-8');
  return resolve(parseArchilang(yaml));
}

describe('area-table', () => {
  describe('computeAreaSummary', () => {
    it('computes correct areas for basic rooms', () => {
      const model = loadSample('basic-3room.yaml');
      const summary = computeAreaSummary(model);

      expect(summary.rows.length).toBeGreaterThan(0);
      expect(summary.totalFloorAreaM2).toBeGreaterThan(0);

      // Total should equal sum of top-level room areas
      const sumFromRows = summary.rows
        .filter(r => !r.parentRoomId)
        .reduce((sum, r) => sum + r.areaMm2, 0);
      expect(summary.totalFloorAreaMm2).toBe(sumFromRows);
    });

    it('includes sub_rooms as child rows', () => {
      const model = loadSample('4ldk-complex.yaml');
      const summary = computeAreaSummary(model);

      const subRows = summary.rows.filter(r => r.parentRoomId);
      expect(subRows.length).toBeGreaterThan(0);

      // Each sub_room should reference a valid parent
      for (const sr of subRows) {
        const parent = summary.rows.find(r => r.roomId === sr.parentRoomId);
        expect(parent).toBeDefined();
      }
    });

    it('handles L-shaped room with sub_rooms', () => {
      const model = loadSample('l-shaped-ldk.yaml');
      const summary = computeAreaSummary(model);

      const ldk = summary.rows.find(r => r.roomId === 'ldk');
      expect(ldk).toBeDefined();
      // L-shaped LDK: (7*4 + 4*3) grids = 40 modules²
      const mod = 910;
      expect(ldk!.areaMm2).toBe(40 * mod * mod);

      const living = summary.rows.find(r => r.roomId === 'living');
      const kitchen = summary.rows.find(r => r.roomId === 'kitchen');
      expect(living).toBeDefined();
      expect(kitchen).toBeDefined();
      expect(living!.parentRoomId).toBe('ldk');
      expect(kitchen!.parentRoomId).toBe('ldk');
    });

    it('tatami calculation uses 2*module² unit', () => {
      const model = loadSample('basic-3room.yaml');
      const summary = computeAreaSummary(model);
      const tatamiUnit = 2 * model.moduleSize * model.moduleSize;

      for (const row of summary.rows) {
        expect(row.tatami).toBeCloseTo(row.areaMm2 / tatamiUnit, 5);
      }
    });
  });

  describe('areaSummaryToJson', () => {
    it('produces valid JSON structure', () => {
      const model = loadSample('4ldk-complex.yaml');
      const summary = computeAreaSummary(model);
      const json = areaSummaryToJson(summary) as any;

      expect(json.rooms).toBeInstanceOf(Array);
      expect(json.summary).toBeDefined();
      expect(json.summary.total_floor_area_m2).toBeGreaterThan(0);
      expect(json.summary.building_area_m2).toBe(json.summary.total_floor_area_m2);

      // Check sub_room has parent field
      const sub = json.rooms.find((r: any) => r.parent);
      expect(sub).toBeDefined();
      expect(sub.area_m2).toBeGreaterThan(0);
    });
  });

  describe('SVG integration', () => {
    it('includes area-table group when rendering.area_table.enabled is true', () => {
      const model = loadSample('basic-3room.yaml');
      model.rendering = { ...model.rendering, area_table: { enabled: true } };
      const svg = composeSvg(model);
      expect(svg).toContain('id="area-table"');
      expect(svg).toContain('面積表');
      expect(svg).toContain('延床面積');
    });

    it('excludes area-table when rendering.area_table is not set', () => {
      const model = loadSample('basic-3room.yaml');
      const svg = composeSvg(model);
      expect(svg).not.toContain('id="area-table"');
    });

    it('renders sub_room rows with indent', () => {
      const model = loadSample('4ldk-complex.yaml');
      model.rendering = { ...model.rendering, area_table: { enabled: true } };
      const svg = composeSvg(model);
      expect(svg).toContain('キッチン');
      expect(svg).toContain('リビング');
      expect(svg).toContain('浴室');
      expect(svg).toContain('洗面');
    });
  });
});
