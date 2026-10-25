// CHW-10: KeyboardShortcuts.tsx — описания через t() (ru/en), ?/Escape, controlled mode.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '@/i18n'
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts'

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('ru')
  })
})

describe('KeyboardShortcuts (CHW-10)', () => {
  it('trigger-кнопка (icon-only) имеет переведённый aria-label', () => {
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
    expect(screen.getByText('Следующий тикет (в списке)')).toBeInTheDocument()
    expect(screen.getByText('Предыдущий тикет (в списке)')).toBeInTheDocument()
    expect(screen.getByText('Открыть выбранный тикет')).toBeInTheDocument()
    expect(screen.getByText('Закрыть диалог')).toBeInTheDocument()
    expect(screen.getByText('Показать горячие клавиши')).toBeInTheDocument()
    expect(screen.getByText('Ctrl')).toBeInTheDocument()
    // «?» встречается дважды: в списке сочетаний и в подсказке внизу диалога
    expect(screen.getAllByText('?', { selector: 'kbd' })).toHaveLength(2)
  })

  it('описания берутся из переводов, а не из русского текста в коде', async () => {
    await act(async () => {
      await i18n.changeLanguage('en')
    })
    const user = userEvent.setup()
    render(<KeyboardShortcuts />)
    await user.click(screen.getByLabelText('Keyboard shortcuts'))

    expect(await screen.findByRole('heading', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
    expect(screen.getByText('Create a new ticket')).toBeInTheDocument()
    expect(screen.getByText('Focus search')).toBeInTheDocument()
    expect(screen.getByText('Show keyboard shortcuts')).toBeInTheDocument()
    expect(screen.queryByText('Создать новый тикет')).not.toBeInTheDocument()
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

  it('? игнорируется внутри contentEditable', async () => {
    render(<KeyboardShortcuts />)
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    document.body.appendChild(editor)
    try {
      fireEvent.keyDown(editor, { key: '?' })
      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: 'Горячие клавиши' })).not.toBeInTheDocument()
      })
    } finally {
      editor.remove()
    }
  })

  it('controlled mode: open=true показывает диалог без trigger-кнопки', () => {
    render(<KeyboardShortcuts open onOpenChange={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Горячие клавиши' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Горячие клавиши' })).not.toBeInTheDocument()
  })
})
