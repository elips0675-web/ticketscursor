import { useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Eye, Edit3 } from 'lucide-react'

function renderMarkdown(text: string): string {
  let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>')
  html = html.replace(/`{3}([\s\S]*?)`{3}/g, '<pre><code>$1</code></pre>')
  html = html.replace(/`(.*?)`/g, '<code>$1</code>')
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
  html = html.replace(/^(?!<[hul])((?!<).+)$/gm, '<p>$1</p>')
  html = html.replace(/<p><\/p>/g, '')

  return html
}

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  className?: string
  onKeyDown?: (e: React.KeyboardEvent) => void
}

export function MarkdownEditor({ value, onChange, placeholder, rows = 4, className, onKeyDown }: MarkdownEditorProps) {
  const [preview, setPreview] = useState(false)

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 text-xs gap-1"
          onClick={() => setPreview(!preview)}
        >
          {preview ? <Edit3 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {preview ? 'Редактировать' : 'Просмотр'}
        </Button>
      </div>
      {preview ? (
        <div
          className="min-h-[80px] rounded-md border border-input bg-transparent px-3 py-2 text-sm prose prose-sm max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }}
        />
      ) : (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className={className}
          onKeyDown={onKeyDown}
        />
      )}
    </div>
  )
}
