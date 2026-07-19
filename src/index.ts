// Library entry point.
//
// Re-exports the rendering pipeline and nothing else. Every module reachable
// from here is free of `node:` imports, so this entry is safe to bundle for
// the browser — the CLI (`main.ts`) and the file watcher (`watcher.ts`) are
// deliberately not exported, since those are the only modules that touch the
// filesystem.
//
// Typical use:
//
//   import { parseArchilang, resolveModel, validateBuilding, composeSvg }
//     from 'archilang';
//
//   const spec       = parseArchilang(yamlText);
//   const model      = resolveModel(spec);
//   const validation = validateBuilding(model);
//   const svg        = composeSvg(model);

export { parseArchilang } from './parser.js';
export { resolve as resolveModel } from './resolver.js';
export { validateBuilding, formatValidation } from './validator.js';
export { composeSvg } from './svg-composer.js';
export { computeAreaSummary, areaSummaryToJson } from './area-table.js';
export { toValidationJson } from './fix-hints.js';
export { runSolveLoop } from './solve.js';
export type { SolveOptions, SolveResult } from './solve.js';
export { applyAutoFixes } from './auto-fix.js';
export type { FixResult } from './auto-fix.js';
export { openingStyleKind, isSwingStyle } from './opening-styles.js';
export type { OpeningStyleKind } from './opening-styles.js';
export { escapeXml } from './svg-utils.js';

export type * from './types.js';
export type { ValidationResult, ValidationIssue, Severity, IssueCode } from './validator.js';
