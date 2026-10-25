import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Keyboard } from 'lucide-react'
import { isTypingTarget } from '@/hooks/use-global-shortcuts'

const SHORTCUTS = [
  { keys: ['Ctrl', 'K'], descriptionKey: 'shortcuts.commandPalette' },
  { keys: ['C'], descriptionKey: 'shortcuts.newTicket' },
  { keys: ['/'], descriptionKey: 'shortcuts.focusSearch' },
  { keys: ['J'], descriptionKey: 'shortcuts.nextTicket' },
  { keys: ['K'], descriptionKey: 'shortcuts.prevTicket' },
  { keys: ['Enter'], descriptionKey: 'shortcuts.openTicket' },
  { keys: ['Esc'], descriptionKey: 'shortcuts.closeDialog' },
  { keys: ['?'], descriptionKey: 'shortcuts.showShortcuts' },
]

interface KeyboardShortcutsProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function KeyboardShortcuts({ open: controlledOpen, onOpenChange }: KeyboardShortcutsProps) {
  const { t } = useTranslation()
  const [internalOpen, setInternalOpen] = useState(false)
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setOpen = onOpenChange || setInternalOpen

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (isTypingTarget(e.target)) return
        e.preventDefault()
        setOpen(!isOpen)
      }
      if (e.key === 'Escape' && isOpen) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, setOpen])

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {!controlledOpen && (
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5" aria-label={t('shortcuts.title')}>
            <Keyboard className="w-4 h-4" />
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="w-5 h-5" />
            {t('shortcuts.title')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.descriptionKey} className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t(shortcut.descriptionKey)}</span>
              <div className="flex items-center gap-1">
                {shortcut.keys.map((key, j) => (
                  <span key={key}>
                    <kbd className="inline-flex h-6 min-w-[24px] items-center justify-center rounded border bg-muted px-1.5 font-mono text-xs font-medium">
                      {key}
                    </kbd>
                    {j < shortcut.keys.length - 1 && <span className="text-muted-foreground mx-0.5">+</span>}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground text-center">
          {t('shortcuts.hintPrefix')}{' '}
          <kbd className="px-1 py-0.5 rounded border bg-muted text-[10px]">?</kbd> {t('shortcuts.hintSuffix')}
        </p>
      </DialogContent>
    </Dialog>
  )
}
