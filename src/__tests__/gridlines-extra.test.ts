import { describe, it, expect } from 'vitest';
import { resolve } from '../resolver.js';
import { parseArchilang } from '../parser.js';
import { composeSvg } from '../svg-composer.js';

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
rendering:
  grid_lines:
    enabled: true
geometry:
  grids:
    module: 910mm
    1F:
      x_spans: [4, 4]
      y_spans: [7]
  rooms:
    - id: living
      floor: 1F
      type: リビング
      grid_rect: { x: 0, y: 0, w: 4, h: 7 }
    - id: dining
      floor: 1F
      type: ダイニング
      grid_rect: { x: 4, y: 0, w: 4, h: 7 }
  openings: []
`;

describe('extraGridLines in BuildingModel', () => {
  it('has empty extraGridLines when no walls have grid_line flag', () => {
    const model = resolve(parseArchilang(BASE_YAML));
    expect(model.extraGridLines).toEqual({ x: [], y: [] });
  });

  it('collects x position from vertical wall with grid_line: true', () => {
    const yaml = BASE_YAML + `
  walls:
    segments:
      - id: w1
        floor: 1F
        from: { x: 1820, y: 0 }
        to: { x: 1820, y: 3640 }
        type: internal
        grid_line: true
`;
    const model = resolve(parseArchilang(yaml));
    expect(model.extraGridLines.x).toContain(1820);
    expect(model.extraGridLines.y).toEqual([]);
  });

  it('collects y position from horizontal wall with grid_line: true', () => {
    const yaml = BASE_YAML + `
  walls:
    segments:
      - id: w1
        floor: 1F
        from: { x: 0, y: 2500 }
        to: { x: 1820, y: 2500 }
        type: external
        grid_line: true
`;
    const model = resolve(parseArchilang(yaml));
    expect(model.extraGridLines.x).toEqual([]);
    expect(model.extraGridLines.y).toContain(2500);
  });

  it('does not collect position when grid_line is false or omitted', () => {
    const yaml = BASE_YAML + `
  walls:
    segments:
      - id: w1
        floor: 1F
        from: { x: 1820, y: 0 }
        to: { x: 1820, y: 3640 }
        type: internal
      - id: w2
        floor: 1F
        from: { x: 0, y: 2500 }
        to: { x: 1820, y: 2500 }
        type: external
        grid_line: false
`;
    const model = resolve(parseArchilang(yaml));
    expect(model.extraGridLines).toEqual({ x: [], y: [] });
  });

  it('deduplicates positions matching span boundaries', () => {
    // x_spans [4,4] → boundaries at 0, 4*910=3640, 8*910=7280
    // Adding a wall at x=3640 with grid_line should not duplicate
    const yaml = BASE_YAML + `
  walls:
    segments:
      - id: w_dup
        floor: 1F
        from: { x: 3640, y: 0 }
        to: { x: 3640, y: 6370 }
        type: internal
        grid_line: true
`;
    const model = resolve(parseArchilang(yaml));
    // 3640 is already a span boundary, should not appear in extra
    expect(model.extraGridLines.x).not.toContain(3640);
  });
});

describe('gridline renderer with extraGridLines', () => {
  it('renders extra grid lines in SVG with sequential labels', () => {
    const yaml = BASE_YAML + `
  walls:
    segments:
      - id: w1
        floor: 1F
        from: { x: 1820, y: 0 }
        to: { x: 1820, y: 3640 }
        type: internal
        grid_line: true
`;
    const model = resolve(parseArchilang(yaml));
    const svg = composeSvg(model);

    // x_spans [4,4] → X positions at 0, 3640, 7280
    // Extra: 1820
    // Sorted all X: 0, 1820, 3640, 7280 → labels X1, X2, X3, X4
    expect(svg).toContain('X1');
    expect(svg).toContain('X2'); // 1820 extra
    expect(svg).toContain('X3');
    expect(svg).toContain('X4');
  });

  it('renders Y extra grid lines with sequential labels', () => {
    const yaml = BASE_YAML + `
  walls:
    segments:
      - id: w1
        floor: 1F
        from: { x: 0, y: 2500 }
        to: { x: 3640, y: 2500 }
        type: external
        grid_line: true
`;
    const model = resolve(parseArchilang(yaml));
    const svg = composeSvg(model);

    // y_spans [7] → Y positions at 0, 6370
    // Extra: 2500
    // Sorted all Y: 0, 2500, 6370 → labels Y1, Y2, Y3
    expect(svg).toContain('Y1');
    expect(svg).toContain('Y2'); // 2500 extra
    expect(svg).toContain('Y3');
  });

  it('backward compatible: no extra lines when walls section absent', () => {
    const model = resolve(parseArchilang(BASE_YAML));
    const svg = composeSvg(model);
    // x_spans [4,4] → X1, X2, X3 only
    expect(svg).toContain('X1');
    expect(svg).toContain('X2');
    expect(svg).toContain('X3');
    expect(svg).not.toContain('X4');
  });
});
