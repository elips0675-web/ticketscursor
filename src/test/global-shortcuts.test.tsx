// CHW-10: глобальные сочетания — чистые решатели + хук (навигация и фокус поиска).
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import {
  isDialogOpen,
  isTypingTarget,
  resolveGlobalShortcut,
  resolveListShortcut,
  useGlobalShortcuts,
  SEARCH_INPUT_SELECTOR,
} from '@/hooks/use-global-shortcuts'

function keyEvent(init: KeyboardEventInit, target: EventTarget | null = document.body): KeyboardEvent {
  const event = new KeyboardEvent('keydown', init)
  Object.defineProperty(event, 'target', { value: target, configurable: true })
  return event
}

const created: HTMLElement[] = []

function append(element: HTMLElement): HTMLElement {
  document.body.appendChild(element)
  created.push(element)
  return element
}

afterEach(() => {
  while (created.length > 0) created.pop()?.remove()
})

describe('isTypingTarget', () => {
  it('поля ввода и contentEditable — да', () => {
    expect(isTypingTarget(append(document.createElement('input')))).toBe(true)
    expect(isTypingTarget(append(document.createElement('textarea')))).toBe(true)
    expect(isTypingTarget(append(document.createElement('select')))).toBe(true)
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    expect(isTypingTarget(append(editor))).toBe(true)
  })

  it('обычный элемент, body, window и null — нет', () => {
    expect(isTypingTarget(append(document.createElement('div')))).toBe(false)
    expect(isTypingTarget(document.body)).toBe(false)
    expect(isTypingTarget(window)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})

describe('isDialogOpen', () => {
  it('видит role=dialog и role=alertdialog', () => {
    expect(isDialogOpen()).toBe(false)
    const dialog = append(document.createElement('div'))
    dialog.setAttribute('role', 'dialog')
    expect(isDialogOpen()).toBe(true)
    dialog.remove()
    created.pop()
    const alert = append(document.createElement('div'))
    alert.setAttribute('role', 'alertdialog')
    expect(isDialogOpen()).toBe(true)
  })

  it('без document возвращает false, а не падает', () => {
    expect(isDialogOpen(null)).toBe(false)
  })
})

describe('resolveGlobalShortcut', () => {
  it('c — новый тикет, / — фокус на поиск', () => {
    expect(resolveGlobalShortcut(keyEvent({ key: 'c' }), { dialogOpen: false })).toBe('new-ticket')
    expect(resolveGlobalShortcut(keyEvent({ key: 'C' }), { dialogOpen: false })).toBe('new-ticket')
    expect(resolveGlobalShortcut(keyEvent({ key: '/' }), { dialogOpen: false })).toBe('focus-search')
  })

  it('модификаторы отдают сочетание другим обработчикам (Ctrl+K — палитра)', () => {
    expect(resolveGlobalShortcut(keyEvent({ key: 'c', ctrlKey: true }), { dialogOpen: false })).toBeNull()
    expect(resolveGlobalShortcut(keyEvent({ key: 'c', metaKey: true }), { dialogOpen: false })).toBeNull()
    expect(resolveGlobalShortcut(keyEvent({ key: 'c', shiftKey: true }), { dialogOpen: false })).toBeNull()
    expect(resolveGlobalShortcut(keyEvent({ key: 'k', ctrlKey: true }), { dialogOpen: false })).toBeNull()
    expect(resolveGlobalShortcut(keyEvent({ key: '?', shiftKey: true }), { dialogOpen: false })).toBeNull()
  })

  it('в поле ввода не срабатывает', () => {
    const input = append(document.createElement('input'))
    expect(resolveGlobalShortcut(keyEvent({ key: 'c' }, input), { dialogOpen: false })).toBeNull()
    expect(resolveGlobalShortcut(keyEvent({ key: '/' }, input), { dialogOpen: false })).toBeNull()
  })

  it('при открытом диалоге не срабатывает', () => {
    expect(resolveGlobalShortcut(keyEvent({ key: 'c' }), { dialogOpen: true })).toBeNull()
    expect(resolveGlobalShortcut(keyEvent({ key: '/' }), { dialogOpen: true })).toBeNull()
  })

  it('посторонние клавиши — null', () => {
    expect(resolveGlobalShortcut(keyEvent({ key: 'x' }), { dialogOpen: false })).toBeNull()
    expect(resolveGlobalShortcut(keyEvent({ key: 'Enter' }), { dialogOpen: false })).toBeNull()
  })
})

describe('resolveListShortcut', () => {
  const base = { activeIndex: -1, count: 3, dialogOpen: false }

  it('j двигает вперёд, k — назад', () => {
    expect(resolveListShortcut(keyEvent({ key: 'j' }), base)).toEqual({ type: 'next', index: 0 })
    expect(resolveListShortcut(keyEvent({ key: 'j' }), { ...base, activeIndex: 0 })).toEqual({ type: 'next', index: 1 })
    expect(resolveListShortcut(keyEvent({ key: 'k' }), { ...base, activeIndex: 2 })).toEqual({ type: 'prev', index: 1 })
  })

  it('не выходит за границы списка', () => {
    expect(resolveListShortcut(keyEvent({ key: 'j' }), { ...base, activeIndex: 2 })).toEqual({ type: 'next', index: 2 })
    expect(resolveListShortcut(keyEvent({ key: 'k' }), { ...base, activeIndex: 0 })).toEqual({ type: 'prev', index: 0 })
    expect(resolveListShortcut(keyEvent({ key: 'k' }), base)).toEqual({ type: 'prev', index: 0 })
  })

  it('Enter открывает только выбранную карточку', () => {
    expect(resolveListShortcut(keyEvent({ key: 'Enter' }), base)).toBeNull()
    expect(resolveListShortcut(keyEvent({ key: 'Enter' }), { ...base, activeIndex: 1 })).toEqual({
      type: 'open',
      index: 1,
    })
    expect(resolveListShortcut(keyEvent({ key: 'Enter' }), { ...base, activeIndex: 5 })).toBeNull()
  })

  it('пустой список, поле ввода, диалог и модификаторы — null', () => {
    expect(resolveListShortcut(keyEvent({ key: 'j' }), { ...base, count: 0 })).toBeNull()
    const input = append(document.createElement('input'))
    expect(resolveListShortcut(keyEvent({ key: 'j' }, input), base)).toBeNull()
    expect(resolveListShortcut(keyEvent({ key: 'j' }), { ...base, dialogOpen: true })).toBeNull()
    expect(resolveListShortcut(keyEvent({ key: 'j', ctrlKey: true }), base)).toBeNull()
    expect(resolveListShortcut(keyEvent({ key: 'j', shiftKey: true }), base)).toBeNull()
  })

  it('другие клавиши не трогают список', () => {
    expect(resolveListShortcut(keyEvent({ key: 'ArrowDown' }), base)).toBeNull()
    expect(resolveListShortcut(keyEvent({ key: '/' }), base)).toBeNull()
  })
})

function Harness() {
  useGlobalShortcuts()
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

function renderHarness(initial = '/') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Harness />
    </MemoryRouter>,
  )
}

describe('useGlobalShortcuts', () => {
  it('c ведёт на создание тикета', () => {
    renderHarness()
    fireEvent.keyDown(window, { key: 'c' })
    expect(screen.getByTestId('location').textContent).toBe('/tickets/new')
  })

  it('c не срабатывает, когда фокус в поле ввода', () => {
    renderHarness()
    const input = append(document.createElement('input'))
    input.focus()
    fireEvent.keyDown(input, { key: 'c' })
    expect(screen.getByTestId('location').textContent).toBe('/')
  })

  it('/ фокусирует существующее поле поиска', () => {
    renderHarness()
    const input = append(document.createElement('input'))
    input.setAttribute('data-search-input', '')
    fireEvent.keyDown(window, { key: '/' })
    expect(document.activeElement).toBe(input)
    expect(screen.getByTestId('location').textContent).toBe('/')
  })

  it('/ без поля поиска уводит на список тикетов с фокусом', () => {
    renderHarness()
    expect(document.querySelector(SEARCH_INPUT_SELECTOR)).toBeNull()
    fireEvent.keyDown(window, { key: '/' })
    expect(screen.getByTestId('location').textContent).toBe('/tickets?focus=search')
  })

  it('Ctrl+K не перехватывается — палитра открывается своим обработчиком', () => {
    renderHarness()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.getByTestId('location').textContent).toBe('/')
  })
})
