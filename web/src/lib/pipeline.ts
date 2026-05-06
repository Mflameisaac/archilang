import { parseArchilang } from '../../../src/parser'
import { resolve as resolveModel } from '../../../src/resolver'
import { validateBuilding, type ValidationResult } from '../../../src/validator'
import { composeSvg } from '../../../src/svg-composer'

export type PipelineResult =
  | { ok: true; svg: string; validation: ValidationResult }
  | { ok: false; error: string; errorDetail?: string }

export function runPipeline(yamlText: string): PipelineResult {
  try {
    const spec = parseArchilang(yamlText)
    const model = resolveModel(spec)
    const validation = validateBuilding(model)
    const svg = composeSvg(model)
    return { ok: true, svg, validation }
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    return { ok: false, error: e.message, errorDetail: e.stack }
  }
}
