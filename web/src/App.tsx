import { useState } from 'react'
import { YamlEditor } from '@/components/YamlEditor'
import { SvgPreview } from '@/components/SvgPreview'
import { ValidationPanel } from '@/components/ValidationPanel'
import { SampleSelector } from '@/components/SampleSelector'
import { DownloadButton } from '@/components/DownloadButton'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { useArchilangPipeline } from '@/hooks/useArchilangPipeline'
import { defaultSample, samples } from '@/lib/samples'

export default function App() {
  const [yamlText, setYamlText] = useState(defaultSample.yaml)
  const [sampleId, setSampleId] = useState(defaultSample.id)

  const { result, lastSuccessSvg } = useArchilangPipeline(yamlText)

  function handleSampleChange(id: string) {
    const next = samples.find((s) => s.id === id)
    if (!next) return
    setSampleId(id)
    setYamlText(next.yaml)
  }

  const currentSvg = result?.ok ? result.svg : lastSuccessSvg
  const stale = result !== null && !result.ok && lastSuccessSvg !== null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-2.5">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold tracking-tight">archilang</h1>
          <span className="text-xs text-muted-foreground">
            YAML floor-plan playground
          </span>
        </div>
        <div className="flex items-center gap-2">
          <SampleSelector value={sampleId} onSelect={handleSampleChange} />
          <DownloadButton svg={currentSvg} />
          <a
            href="https://github.com/4kk11/archilang"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            github
          </a>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel defaultSize={45} minSize={20}>
            <YamlEditor value={yamlText} onChange={setYamlText} />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={55} minSize={25}>
            <div className="flex h-full min-h-0 flex-col">
              <div className="min-h-0 flex-1">
                <SvgPreview svg={currentSvg} stale={stale} />
              </div>
              <ValidationPanel result={result} />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </div>
  )
}
