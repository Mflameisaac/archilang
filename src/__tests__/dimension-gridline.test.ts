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

describe('grid-line dimension row 3', () => {
  it('does not render row 3 when grid_lines is disabled', () => {
    // No rendering.grid_lines → no row 3
    const model = resolve(parseArchilang(BASE_YAML));
    const svg = composeSvg(model);

    // Row 1 (span dims) and Row 2 (total dim) exist as the dimensions group
    expect(svg).toContain('id="dimensions"');

    // Should NOT have a grid-line-dimensions group
    expect(svg).not.toContain('id="gridline-dimensions"');
  });

  it('does not render row 3 when grid_lines enabled but no extra grid lines (span-only positions)', () => {
    // With grid_lines enabled but no extra walls → grid line positions = span boundaries
    // Same as span dims → row 3 is redundant, should be skipped
    const yaml = BASE_YAML.replace(
      'geometry:',
      'rendering:\n  grid_lines:\n    enabled: true\ngeometry:',
    );
    const model = resolve(parseArchilang(yaml));
    const svg = composeSvg(model);

    // x_spans [4,4] → span boundaries 0, 3640, 7280 (3 positions)
    // Grid line positions same as span boundaries → no extra info → skip row 3
    expect(svg).not.toContain('id="gridline-dimensions"');
  });

  it('renders row 3 when extra grid lines produce more than span boundaries', () => {
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
  walls:
    segments:
      - id: w1
        floor: 1F
        from: { x: 1820, y: 0 }
        to: { x: 1820, y: 6370 }
        type: internal
        grid_line: true
`;
    const model = resolve(parseArchilang(yaml));
    const svg = composeSvg(model);

    // Grid line X positions: 0, 1820, 3640, 7280 (4 positions, more than span boundaries)
    // Segments: 0→1820 (1820mm), 1820→3640 (1820mm), 3640→7280 (3640mm)
    expect(svg).toContain('id="gridline-dimensions"');
    expect(svg).toContain('1,820');  // 1820mm segment
    expect(svg).toContain('3,640');  // 3640mm segment (also used in span dims)

    // Black dots at every dimension-line endpoint (all rows)
    const dots = svg.match(/<circle[^>]*fill="#333"[^>]*\/>/g) ?? [];
    expect(dots.length).toBeGreaterThan(0);
  });

  it('renders Y-axis row 3 with correct values', () => {
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

    // Grid line Y positions: 0, 2500, 6370 (3 positions, more than span boundaries [0, 6370])
    // Segments: 0→2500 (2500mm), 2500→6370 (3870mm)
    expect(svg).toContain('id="gridline-dimensions"');
    expect(svg).toContain('2,500');
    expect(svg).toContain('3,870');

    // Black dots at every dimension-line endpoint (all rows)
    const dots = svg.match(/<circle[^>]*fill="#333"[^>]*\/>/g) ?? [];
    expect(dots.length).toBeGreaterThan(0);
  });
});
