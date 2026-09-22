import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MarkdownEditor } from '@/components/MarkdownEditor'

describe('MarkdownEditor', () => {
  it('renders textarea with value and placeholder', () => {
    render(<MarkdownEditor value="Hello" onChange={() => {}} placeholder="Введите текст" />)
    const textarea = screen.getByPlaceholderText('Введите текст')
    expect(textarea).toBeInTheDocument()
    expect((textarea as HTMLTextAreaElement).value).toBe('Hello')
  })

  it('calls onChange when typing', () => {
    const onChange = vi.fn()
    render(<MarkdownEditor value="" onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'New' } })
    expect(onChange).toHaveBeenCalledWith('New')
  })

  it('switches to preview mode', () => {
    render(<MarkdownEditor value="# Заголовок" onChange={() => {}} />)
    fireEvent.click(screen.getByText('Просмотр'))
    expect(screen.getByText('Редактировать')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Заголовок')
  })

  it('switches back to edit mode', () => {
    render(<MarkdownEditor value="text" onChange={() => {}} />)
    fireEvent.click(screen.getByText('Просмотр'))
    fireEvent.click(screen.getByText('Редактировать'))
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('renders bold and code in preview', () => {
    render(<MarkdownEditor value={'**bold** `code`'} onChange={() => {}} />)
    fireEvent.click(screen.getByText('Просмотр'))
    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.getByText('code').tagName).toBe('CODE')
  })

  it('escapes HTML in preview', () => {
    render(<MarkdownEditor value={'<script>alert(1)</script>'} onChange={() => {}} />)
    fireEvent.click(screen.getByText('Просмотр'))
    expect(document.querySelector('script')).not.toBeInTheDocument()
    expect(screen.getByText(/alert\(1\)/)).toBeInTheDocument()
  })

  it('respects rows prop', () => {
    render(<MarkdownEditor value="" onChange={() => {}} rows={6} />)
    expect(screen.getByRole('textbox').getAttribute('rows')).toBe('6')
  })

  it('forwards onKeyDown handler', () => {
    const onKeyDown = vi.fn()
    render(<MarkdownEditor value="" onChange={() => {}} onKeyDown={onKeyDown} />)
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Tab' })
    expect(onKeyDown).toHaveBeenCalled()
  })
})