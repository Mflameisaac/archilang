import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { yaml } from '@codemirror/lang-yaml'
import { EditorView } from '@codemirror/view'

interface Props {
  value: string
  onChange: (next: string) => void
}

export function YamlEditor({ value, onChange }: Props) {
  const extensions = useMemo(
    () => [yaml(), EditorView.lineWrapping],
    [],
  )

  return (
    <div className="h-full overflow-hidden bg-card">
      <CodeMirror
        value={value}
        height="100%"
        theme="light"
        extensions={extensions}
        onChange={onChange}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          autocompletion: false,
        }}
        style={{
          height: '100%',
          fontSize: '13px',
          fontFamily:
            'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        }}
      />
    </div>
  )
}
