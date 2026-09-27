// Этап 68: KeyboardShortcuts.tsx — 0% → тесты trigger (a11y aria-label), ?/Escape, controlled mode.
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts'

describe('KeyboardShortcuts (Этап 68)', () => {
  it('trigger-кнопка (icon-only) имеет aria-label «Горячие клавиши»', () => {
    render(<KeyboardShortcuts />)
    expect(screen.getByLabelText('Горячие клавиши')).toBeInTheDocument()
  })

  it('клик по кнопке открывает диалог с 8 сочетаниями', async () => {
    const user = userEvent.setup()
    render(<KeyboardShortcuts />)
    await user.click(screen.getByLabelText('Горячие клавиши'))

    expect(await screen.findByRole('heading', { name: 'Горячие клавиши' })).toBeInTheDocument()
    expect(screen.getByText('Командная палитра (поиск, навигация)')).toBeInTheDocument()
    expect(screen.getByText('Создать новый тикет')).toBeInTheDocument()
    expect(screen.getByText('Фокус на поиск')).toBeInTheDocument()
    expect(screen.getByText('Ctrl')).toBeInTheDocument()
    // «?» встречается дважды: в списке сочетаний и в подсказке внизу диалога
    expect(screen.getAllByText('?', { selector: 'kbd' })).toHaveLength(2)
  })

  it('клавиша ? открывает и снова закрывает диалог', async () => {
    render(<KeyboardShortcuts />)
    fireEvent.keyDown(window, { key: '?' })
    expect(await screen.findByRole('heading', { name: 'Горячие клавиши' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: '?' })
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Горячие клавиши' })).not.toBeInTheDocument()
    })
  })

  it('Escape закрывает открытый диалог', async () => {
    const user = userEvent.setup()
    render(<KeyboardShortcuts />)
    await user.click(screen.getByLabelText('Горячие клавиши'))
    await screen.findByRole('heading', { name: 'Горячие клавиши' })

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Горячие клавиши' })).not.toBeInTheDocument()
    })
  })

  it('? игнорируется внутри поля ввода', async () => {
    render(<KeyboardShortcuts />)
    const input = document.createElement('input')
    document.body.appendChild(input)
    try {
      fireEvent.keyDown(input, { key: '?' })
      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: 'Горячие клавиши' })).not.toBeInTheDocument()
      })
    } finally {
      input.remove()
    }
  })

  it('controlled mode: open=true показывает диалог без trigger-кнопки', () => {
    render(<KeyboardShortcuts open onOpenChange={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Горячие клавиши' })).toBeInTheDocument()
    // trigger-кнопки нет: у диалога другой способ открытия
    expect(screen.queryByRole('button', { name: 'Горячие клавиши' })).not.toBeInTheDocument()
  })
})
