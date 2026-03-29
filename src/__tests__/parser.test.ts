import { describe, it, expect } from 'vitest';
import { parseArchilang, parseMm, getFloorGrid } from '../parser.js';
import { readFileSync } from 'fs';
import { resolve as pathResolve } from 'path';

const samplesDir = pathResolve(import.meta.dirname, '../../samples');

function loadSample(name: string) {
  const yaml = readFileSync(`${samplesDir}/${name}.yaml`, 'utf-8');
  return parseArchilang(yaml);
}

describe('parseMm', () => {
  it('parses "910mm" → 910', () => {
    expect(parseMm('910mm')).toBe(910);
  });

  it('parses "130mm" → 130', () => {
    expect(parseMm('130mm')).toBe(130);
  });

  it('throws on invalid format', () => {
    expect(() => parseMm('910')).toThrow('Invalid mm value');
    expect(() => parseMm('mm910')).toThrow('Invalid mm value');
    expect(() => parseMm('abc')).toThrow('Invalid mm value');
  });
});

describe('parseArchilang', () => {
  it('parses basic-3room sample without error', () => {
    const spec = loadSample('basic-3room');
    expect(spec.archilang).toBe('0.2');
    expect(spec.site.orientation).toBe('south');
    expect(spec.geometry.rooms).toHaveLength(3);
    expect(spec.geometry.openings).toHaveLength(6);
  });

  it('normalizes orientation to lowercase', () => {
    const yaml = `
archilang: "0.2"
site:
  orientation: SOUTH
building:
  structure: test
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
      x_spans: [2]
      y_spans: [2]
  rooms:
    - id: r1
      floor: 1F
      type: Room
      grid_rect: { x: 0, y: 0, w: 2, h: 2 }
  openings: []
`;
    const spec = parseArchilang(yaml);
    expect(spec.site.orientation).toBe('south');
  });

  it('throws on missing archilang', () => {
    expect(() => parseArchilang('site: {}')).toThrow('Missing archilang');
  });

  it('throws on missing site', () => {
    expect(() => parseArchilang('archilang: "0.2"')).toThrow('Missing site');
  });

  it('throws on empty rooms', () => {
    const yaml = `
archilang: "0.2"
site:
  orientation: south
geometry:
  grids:
    module: 910mm
  rooms: []
`;
    expect(() => parseArchilang(yaml)).toThrow('No rooms defined');
  });
});

describe('getFloorGrid', () => {
  it('returns 1F grid from basic-3room', () => {
    const spec = loadSample('basic-3room');
    const grid = getFloorGrid(spec, '1F');
    expect(grid.x_spans).toEqual([3, 5]);
    expect(grid.y_spans).toEqual([3, 4]);
  });

  it('throws on missing floor', () => {
    const spec = loadSample('basic-3room');
    expect(() => getFloorGrid(spec, '2F')).toThrow('No grid definition for floor');
  });
});
