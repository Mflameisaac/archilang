import { describe, it, expect } from 'vitest';
import { runSolveLoop } from '../solve.js';
import { parseArchilang } from '../parser.js';
import { resolve as resolveModel } from '../resolver.js';
import { validateBuilding } from '../validator.js';

const header = `archilang: "0.2"
site: { orientation: south }
building:
  structure: masonry
  module: metric
  stories: 1
  defaults:
    ceiling_height: 2700mm
    external_wall: { thickness: 200mm }
    internal_wall: { partition: 150mm }
geometry:
  grids: { module: 500mm, 1F: { x_spans: [8, 8], y_spans: [8, 8] } }
  rooms:
    - { id: living,   floor: 1F, type: Living,   grid_rect: { x: 0, y: 0, w: 8, h: 8 } }
    - { id: corridor, floor: 1F, type: Corridor, grid_rect: { x: 8, y: 0, w: 8, h: 8 } }
    - { id: bed1,     floor: 1F, type: Bedroom,  grid_rect: { x: 0, y: 8, w: 8, h: 8 } }
    - { id: bed2,     floor: 1F, type: Bedroom,  grid_rect: { x: 8, y: 8, w: 8, h: 8 } }
  openings:`;

const entrance = `
    - id: ED1
      type: AD
      style: swing
      room: living
      wall: south
      position: center
      size: { w: 1000, h: 2400 }`;

const errorsOf = (yaml: string) =>
  validateBuilding(resolveModel(parseArchilang(yaml))).issues.filter(i => i.severity === 'error');

describe('SKIPPED_OPENING auto-fix', () => {
  // living and bed2 are diagonally opposite and share no wall.
  const yaml = header + entrance + `
    - id: d_impossible
      type: WD
      style: swing
      connects: [living, bed2]
      size: { w: 800, h: 2100 }`;

  it('reports the unresolvable opening before repair', () => {
    expect(errorsOf(yaml).some(i => i.code === 'SKIPPED_OPENING')).toBe(true);
  });

  it('removes the opening and reconnects the plan', () => {
    const result = runSolveLoop(yaml, { maxIterations: 5, dryRun: false });
    expect(result.fixes.some(f => f.applied && f.code === 'SKIPPED_OPENING')).toBe(true);
    expect(result.finalYaml).not.toContain('d_impossible');
    expect(result.finalOk).toBe(true);
  });

  it('leaves the YAML parseable after removal', () => {
    const result = runSolveLoop(yaml, { maxIterations: 5, dryRun: false });
    expect(() => parseArchilang(result.finalYaml)).not.toThrow();
  });
});

describe('UNREACHABLE_ROOM auto-fix', () => {
  // bed1 and bed2 open onto each other but onto nothing else: an island that
  // ROOM_WITHOUT_DOOR cannot catch, since neither room is doorless.
  const island = header + entrance + `
    - id: d_island
      type: WD
      style: swing
      connects: [bed1, bed2]
      size: { w: 800, h: 2100 }`;

  it('detects the island before repair', () => {
    const codes = errorsOf(island).map(i => i.code);
    expect(codes).toContain('UNREACHABLE_ROOM');
  });

  it('attaches the island to reachable space', () => {
    const result = runSolveLoop(island, { maxIterations: 5, dryRun: false });
    expect(result.fixes.some(f => f.applied && f.code === 'UNREACHABLE_ROOM')).toBe(true);
    expect(result.finalOk).toBe(true);
    expect(errorsOf(result.finalYaml)).toHaveLength(0);
  });

  it('prefers connecting to circulation over another habitable room', () => {
    // bed2 adjoins both corridor and bed1; the corridor is the better door.
    const result = runSolveLoop(island, { maxIterations: 5, dryRun: false });
    const added = result.fixes.filter(f => f.applied && f.code === 'UNREACHABLE_ROOM');
    expect(added.some(f => f.description.includes('corridor'))).toBe(true);
  });
});

describe('already-valid plans', () => {
  const valid = header + entrance + `
    - id: d1
      type: WD
      style: swing
      connects: [living, corridor]
      size: { w: 800, h: 2100 }
    - id: d2
      type: WD
      style: swing
      connects: [corridor, bed2]
      size: { w: 800, h: 2100 }
    - id: d3
      type: WD
      style: swing
      connects: [living, bed1]
      size: { w: 800, h: 2100 }`;

  it('applies no fixes and leaves the YAML untouched', () => {
    const result = runSolveLoop(valid, { maxIterations: 5, dryRun: false });
    expect(result.fixes.filter(f => f.applied)).toHaveLength(0);
    expect(result.finalYaml).toBe(valid);
    expect(result.finalOk).toBe(true);
  });
});
