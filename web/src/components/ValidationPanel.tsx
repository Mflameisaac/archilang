import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { PipelineResult } from '@/lib/pipeline'

interface Props {
  result: PipelineResult | null
}

export function ValidationPanel({ result }: Props) {
  if (!result) {
    return (
      <div className="border-t bg-card px-4 py-3 text-xs text-muted-foreground">
        Waiting for input…
      </div>
    )
  }

  if (!result.ok) {
    return (
      <div className="border-t bg-card p-3">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Parse / resolve error</AlertTitle>
          <AlertDescription>
            <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs">
              {result.error}
            </pre>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const { issues, errorCount, warningCount, ok } = result.validation

  if (ok && issues.length === 0) {
    return (
      <div className="flex items-center gap-2 border-t bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        <CheckCircle2 className="h-4 w-4" />
        <span>All checks passed.</span>
      </div>
    )
  }

  return (
    <div className="max-h-64 overflow-y-auto border-t bg-card">
      <div className="sticky top-0 flex items-center gap-3 border-b bg-card/95 px-4 py-2 text-xs font-medium backdrop-blur">
        <span className="text-destructive">{errorCount} error{errorCount === 1 ? '' : 's'}</span>
        <span className="text-amber-600">{warningCount} warning{warningCount === 1 ? '' : 's'}</span>
      </div>
      <ul className="divide-y">
        {issues.map((issue, i) => {
          const isError = issue.severity === 'error'
          const Icon = isError ? AlertCircle : AlertTriangle
          return (
            <li
              key={i}
              className="flex items-start gap-2 px-4 py-2 text-xs"
            >
              <Icon
                className={
                  isError
                    ? 'mt-0.5 h-4 w-4 shrink-0 text-destructive'
                    : 'mt-0.5 h-4 w-4 shrink-0 text-amber-600'
                }
              />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                  [{issue.code}]
                </div>
                <div className="break-words">{issue.message}</div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
