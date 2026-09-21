import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Keyboard, X } from 'lucide-react'

const SHORTCUTS = [
  { keys: ['Ctrl', 'K'], description: 'Командная палитра (поиск, навигация)' },
  { keys: ['C'], description: 'Создать новый тикет' },
  { keys: ['/'], description: 'Фокус на поиск' },
  { keys: ['J'], description: 'Следующий тикет (в списке)' },
  { keys: ['K'], description: 'Предыдущий тикет (в списке)' },
  { keys: ['Enter'], description: 'Открыть выбранный тикет' },
  { keys: ['Esc'], description: 'Закрыть диалог / вернуться назад' },
  { keys: ['?'], description: 'Показать горячие клавиши' },
]

interface KeyboardShortcutsProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function KeyboardShortcuts({ open: controlledOpen, onOpenChange }: KeyboardShortcutsProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setOpen = onOpenChange || setInternalOpen

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
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
          <Button variant="ghost" size="sm" className="gap-1.5">
            <Keyboard className="w-4 h-4" />
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="w-5 h-5" />
            Горячие клавиши
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {SHORTCUTS.map((shortcut, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{shortcut.description}</span>
              <div className="flex items-center gap-1">
                {shortcut.keys.map((key, j) => (
                  <span key={j}>
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
          Нажмите <kbd className="px-1 py-0.5 rounded border bg-muted text-[10px]">?</kbd> чтобы открыть/закрыть
        </p>
      </DialogContent>
    </Dialog>
  )
}
