const modules = import.meta.glob('../../../samples/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

export interface Sample {
  id: string
  label: string
  yaml: string
}

export const samples: Sample[] = Object.entries(modules)
  .map(([p, yaml]) => {
    const id = p.split('/').pop()!.replace(/\.yaml$/, '')
    return { id, label: id, yaml }
  })
  .sort((a, b) => a.id.localeCompare(b.id))

export const defaultSample: Sample =
  samples.find((s) => s.id === 'basic-3room') ?? samples[0]
