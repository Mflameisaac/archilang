import { describe, it, expect } from 'vitest';
import { openingStyleKind, isSwingStyle } from '../opening-styles.js';

describe('openingStyleKind', () => {
  it('resolves the Japanese vocabulary used by the samples', () => {
    expect(openingStyleKind('引違い窓')).toBe('sliding-window');
    expect(openingStyleKind('片開き')).toBe('swing');
    expect(openingStyleKind('引き戸')).toBe('sliding-door');
    expect(openingStyleKind('FIX窓')).toBe('fixed-window');
  });

  it('resolves English equivalents to the same kinds', () => {
    expect(openingStyleKind('sliding-window')).toBe('sliding-window');
    expect(openingStyleKind('swing')).toBe('swing');
    expect(openingStyleKind('sliding-door')).toBe('sliding-door');
    expect(openingStyleKind('fixed-window')).toBe('fixed-window');
  });

  it('treats case, underscores and spaces as equivalent', () => {
    expect(openingStyleKind('Swing')).toBe('swing');
    expect(openingStyleKind('SLIDING_DOOR')).toBe('sliding-door');
    expect(openingStyleKind('Sliding Window')).toBe('sliding-window');
    expect(openingStyleKind('  swing  ')).toBe('swing');
  });

  it('accepts common spelling variants', () => {
    expect(openingStyleKind('引き違い窓')).toBe('sliding-window');
    expect(openingStyleKind('引戸')).toBe('sliding-door');
    expect(openingStyleKind('hinged')).toBe('swing');
  });

  it('returns "unknown" for unrecognised styles rather than throwing', () => {
    expect(openingStyleKind('casement')).toBe('unknown');
    expect(openingStyleKind('')).toBe('unknown');
  });
});

describe('isSwingStyle', () => {
  it('is true only for hinged doors, in either vocabulary', () => {
    expect(isSwingStyle('片開き')).toBe(true);
    expect(isSwingStyle('swing')).toBe(true);
    expect(isSwingStyle('引き戸')).toBe(false);
    expect(isSwingStyle('引違い窓')).toBe(false);
    expect(isSwingStyle('casement')).toBe(false);
  });
});
