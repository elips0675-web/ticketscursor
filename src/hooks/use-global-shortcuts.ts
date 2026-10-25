import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export type GlobalShortcut = 'new-ticket' | 'focus-search'

export type ListShortcut =
  | { type: 'next'; index: number }
  | { type: 'prev'; index: number }
  | { type: 'open'; index: number }

export const SEARCH_INPUT_SELECTOR = '[data-search-input]'

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target.closest('[contenteditable="true"], [contenteditable=""]') !== null) return true
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

export function isDialogOpen(root: ParentNode | null = typeof document === 'undefined' ? null : document): boolean {
  if (!root) return false
  return root.querySelector('[role="dialog"], [role="alertdialog"]') !== null
}

function hasModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
}

export function resolveGlobalShortcut(event: KeyboardEvent, context: { dialogOpen: boolean }): GlobalShortcut | null {
  if (hasModifier(event)) return null
  if (context.dialogOpen || isTypingTarget(event.target)) return null
  const key = event.key.toLowerCase()
  if (key === 'c') return 'new-ticket'
  if (event.key === '/') return 'focus-search'
  return null
}

export function resolveListShortcut(
  event: KeyboardEvent,
  context: { activeIndex: number; count: number; dialogOpen: boolean },
): ListShortcut | null {
  if (hasModifier(event)) return null
  if (context.dialogOpen || isTypingTarget(event.target)) return null
  const { activeIndex, count } = context
  if (count <= 0) return null
  const last = count - 1
  const key = event.key.toLowerCase()
  if (key === 'j') return { type: 'next', index: activeIndex < 0 ? 0 : Math.min(activeIndex + 1, last) }
  if (key === 'k') return { type: 'prev', index: activeIndex < 0 ? 0 : Math.max(activeIndex - 1, 0) }
  if (event.key === 'Enter' && activeIndex >= 0 && activeIndex <= last) {
    return { type: 'open', index: activeIndex }
  }
  return null
}

export function useGlobalShortcuts(): void {
  const navigate = useNavigate()

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const shortcut = resolveGlobalShortcut(event, { dialogOpen: isDialogOpen() })
      if (!shortcut) return
      event.preventDefault()
      if (shortcut === 'new-ticket') {
        navigate('/tickets/new')
        return
      }
      const input = document.querySelector<HTMLInputElement>(SEARCH_INPUT_SELECTOR)
      if (input) {
        input.focus()
        return
      }
      navigate('/tickets?focus=search')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])
}
