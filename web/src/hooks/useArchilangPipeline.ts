import { useEffect, useState } from 'react'
import { runPipeline, type PipelineResult } from '@/lib/pipeline'
import { useDebounced } from './useDebounced'

export function useArchilangPipeline(yamlText: string, delayMs = 300) {
  const debounced = useDebounced(yamlText, delayMs)
  const [result, setResult] = useState<PipelineResult | null>(null)
  const [lastSuccessSvg, setLastSuccessSvg] = useState<string | null>(null)

  useEffect(() => {
    if (!debounced.trim()) {
      setResult(null)
      return
    }
    const r = runPipeline(debounced)
    setResult(r)
    if (r.ok) setLastSuccessSvg(r.svg)
  }, [debounced])

  return { result, lastSuccessSvg }
}
