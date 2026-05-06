import { cn } from '@/lib/utils'

interface Props {
  svg: string | null
  stale: boolean
}

export function SvgPreview({ svg, stale }: Props) {
  if (!svg) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Type or pick a sample to see the floor plan.
      </div>
    )
  }

  return (
    <div className="relative h-full overflow-auto bg-muted/30 p-4">
      {stale && (
        <div className="absolute right-3 top-3 z-10 rounded-md bg-amber-500/90 px-2 py-1 text-xs font-medium text-white shadow">
          stale — fix YAML to refresh
        </div>
      )}
      <div
        className={cn(
          'archilang-svg-host mx-auto flex h-full items-start justify-center transition-opacity',
          stale && 'opacity-60',
        )}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  )
}
