// Opening style vocabulary.
//
// ARCHILANG's authoring vocabulary is Japanese (引違い窓 / 片開き / 引き戸).
// Renderers and validators used to compare against those literals directly,
// which made the strings load-bearing: a typo, a different locale, or a
// machine-generated spec using English terms would silently render nothing.
//
// Styles are now resolved to a canonical kind through an alias table. The
// Japanese terms remain the primary spelling — they are what the samples,
// the README and auto-fix emit — but equivalent English terms resolve to the
// same kind, so specs authored (or generated) in either vocabulary behave
// identically.

/** Canonical opening style, independent of the term used to spell it. */
export type OpeningStyleKind =
  | 'sliding-window'
  | 'swing'
  | 'sliding-door'
  | 'fixed-window'
  | 'unknown';

/**
 * Alias table. Keys are matched after normalisation (see `normalizeKey`), so
 * only one spelling per term is needed here — case and separator variants of
 * the ASCII terms are handled automatically.
 */
const STYLE_ALIASES: Record<string, OpeningStyleKind> = {
  // ── Sliding window ──
  '引違い窓': 'sliding-window',
  '引き違い窓': 'sliding-window',
  'sliding-window': 'sliding-window',
  'slidingwindow': 'sliding-window',

  // ── Swing door (hinged, single leaf) ──
  '片開き': 'swing',
  '片開き戸': 'swing',
  'swing': 'swing',
  'swing-door': 'swing',
  'hinged': 'swing',
  'hinged-door': 'swing',

  // ── Sliding door ──
  '引き戸': 'sliding-door',
  '引戸': 'sliding-door',
  'sliding-door': 'sliding-door',
  'slidingdoor': 'sliding-door',

  // ── Fixed window ──
  // Recognised so it resolves to a kind rather than falling through to
  // 'unknown'; there is no renderer for it yet, so it still draws nothing.
  'fix窓': 'fixed-window',
  'fixed-window': 'fixed-window',
  'fixedwindow': 'fixed-window',
};

/**
 * Normalise a style string for alias lookup: trim surrounding whitespace,
 * lowercase (affects ASCII only — Japanese is unaffected), and treat
 * underscores and spaces as hyphens so `sliding_window`, `Sliding Window`
 * and `sliding-window` are all the same key.
 */
function normalizeKey(style: string): string {
  return style.trim().toLowerCase().replace(/[\s_]+/g, '-');
}

/**
 * Resolve an authored style string to its canonical kind.
 *
 * Returns `'unknown'` for unrecognised styles — callers should treat that as
 * "draw nothing / skip", matching the previous behaviour of an unmatched
 * string falling through every branch.
 *
 * @example
 * openingStyleKind('片開き')  // 'swing'
 * openingStyleKind('swing')   // 'swing'
 * openingStyleKind('Swing')   // 'swing'
 */
export function openingStyleKind(style: string): OpeningStyleKind {
  return STYLE_ALIASES[normalizeKey(style)] ?? 'unknown';
}

/** True when the style is a hinged door, which needs swing clearance. */
export function isSwingStyle(style: string): boolean {
  return openingStyleKind(style) === 'swing';
}
