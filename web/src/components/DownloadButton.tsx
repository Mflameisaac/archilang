import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  svg: string | null
}

export function DownloadButton({ svg }: Props) {
  const disabled = svg === null

  function handleClick() {
    if (!svg) return
    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19)
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `archilang-${stamp}.svg`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={disabled}
    >
      <Download className="h-4 w-4" />
      Download SVG
    </Button>
  )
}
