import { useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { RichAction, RichBlock, RichPayload } from '@/types'

interface RichMessageProps {
  payload: RichPayload | null | undefined
  className?: string
  onAction?: (value: string) => void
}

function ActionButton({ action, onAction }: { action: RichAction; onAction?: (value: string) => void }) {
  if (action.type === 'link' && action.url) {
    return (
      <Button asChild size="sm" variant="outline">
        <a href={action.url} target="_blank" rel="noopener noreferrer">
          {action.label}
          <ExternalLink className="ml-1 h-3 w-3" aria-hidden="true" />
        </a>
      </Button>
    )
  }
  return (
    <Button
      size="sm"
      variant="outline"
      type="button"
      disabled={!onAction || !action.value}
      onClick={() => action.value && onAction?.(action.value)}
    >
      {action.label}
    </Button>
  )
}

function BlockView({ block, onAction }: { block: RichBlock; onAction?: (value: string) => void }) {
  if (block.type === 'card') {
    return (
      <div className="rounded-lg border bg-background/60 p-3 text-left">
        {block.image_url && (
          <img src={block.image_url} alt="" className="mb-2 max-h-40 w-full rounded-md object-cover" />
        )}
        <p className="text-sm font-semibold">{block.title}</p>
        {block.subtitle && <p className="text-xs text-muted-foreground">{block.subtitle}</p>}
        {block.text && <p className="mt-1 whitespace-pre-wrap text-sm">{block.text}</p>}
        {block.actions && block.actions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {block.actions.map((action, index) => (
              <ActionButton key={`${action.label}-${index}`} action={action} onAction={onAction} />
            ))}
          </div>
        )}
      </div>
    )
  }

  if (block.type === 'input') {
    return (
      <div className="space-y-1 text-left">
        <label className="text-xs font-medium text-muted-foreground">
          {block.label}
          {block.required ? ' *' : ''}
        </label>
        <Input disabled placeholder={block.placeholder ?? ''} aria-label={block.label} />
      </div>
    )
  }

  if (block.type === 'select') {
    return (
      <div className="space-y-1 text-left">
        <label className="text-xs font-medium text-muted-foreground">{block.label}</label>
        <select
          disabled
          multiple={block.multiple}
          aria-label={block.label}
          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm disabled:opacity-70"
        >
          {block.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    )
  }

  if (block.type === 'chips') {
    return (
      <div className="flex flex-wrap gap-2">
        {block.options.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant="secondary"
            type="button"
            disabled={!onAction}
            onClick={() => onAction?.(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    )
  }

  return null
}

export default function RichMessage({ payload, className, onAction }: RichMessageProps) {
  const { t } = useTranslation()
  const blocks = payload?.blocks
  if (!Array.isArray(blocks) || blocks.length === 0) return null
  return (
    <div className={cn('mt-2 space-y-2', className)} role="group" aria-label={t('chats.richMessage')}>
      {blocks.map((block, index) => (
        <BlockView key={`${block.type}-${index}`} block={block} onAction={onAction} />
      ))}
    </div>
  )
}
