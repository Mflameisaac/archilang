import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { samples } from '@/lib/samples'

interface Props {
  value: string
  onSelect: (id: string) => void
}

export function SampleSelector({ value, onSelect }: Props) {
  return (
    <Select value={value} onValueChange={onSelect}>
      <SelectTrigger className="w-[220px]" size="sm">
        <SelectValue placeholder="Load a sample…" />
      </SelectTrigger>
      <SelectContent>
        {samples.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
