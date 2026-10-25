import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RichMessage from '@/components/chat/RichMessage'
import type { RichPayload } from '@/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const CARD: RichPayload = {
  blocks: [
    {
      type: 'card',
      title: 'Счёт готов',
      subtitle: 'Октябрь',
      text: 'Оплатите до 5 ноября.',
      actions: [
        { type: 'link', label: 'Открыть', url: 'https://example.com/invoice/1' },
        { type: 'postback', label: 'Напомнить', value: 'remind' },
      ],
    },
  ],
}

describe('RichMessage — рендер блоков (CHW-08)', () => {
  it('не рендерит ничего без блоков', () => {
    const { container } = render(<RichMessage payload={null} />)
    expect(container).toBeEmptyDOMElement()
    const empty = render(<RichMessage payload={{ blocks: [] }} />)
    expect(empty.container).toBeEmptyDOMElement()
  })

  it('карточка показывает заголовок, подзаголовок и текст', () => {
    render(<RichMessage payload={CARD} />)
    expect(screen.getByText('Счёт готов')).toBeInTheDocument()
    expect(screen.getByText('Октябрь')).toBeInTheDocument()
    expect(screen.getByText('Оплатите до 5 ноября.')).toBeInTheDocument()
  })

  it('ссылка открывается в новой вкладке', () => {
    render(<RichMessage payload={CARD} />)
    const link = screen.getByRole('link', { name: /Открыть/ })
    expect(link).toHaveAttribute('href', 'https://example.com/invoice/1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('postback-кнопка отдаёт значение наружу, без обработчика — заблокирована', async () => {
    const onAction = vi.fn()
    const { unmount } = render(<RichMessage payload={CARD} onAction={onAction} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Напомнить' }))
    expect(onAction).toHaveBeenCalledWith('remind')
    unmount()

    render(<RichMessage payload={CARD} />)
    expect(screen.getByRole('button', { name: 'Напомнить' })).toBeDisabled()
  })

  it('чипы вызывают обработчик со значением варианта', async () => {
    const onAction = vi.fn()
    render(
      <RichMessage
        payload={{
          blocks: [
            {
              type: 'chips',
              options: [
                { label: 'Спасибо', value: 'thanks' },
                { label: 'Не помогло', value: 'nope' },
              ],
            },
          ],
        }}
        onAction={onAction}
      />,
    )

    await userEvent.setup().click(screen.getByRole('button', { name: 'Не помогло' }))
    expect(onAction).toHaveBeenCalledWith('nope')
  })

  it('поле ввода показывает подпись, обязательность и placeholder', () => {
    render(
      <RichMessage
        payload={{
          blocks: [
            { type: 'input', name: 'order_id', label: 'Номер заказа', placeholder: 'A-123', required: true },
          ],
        }}
      />,
    )

    expect(screen.getByText('Номер заказа *')).toBeInTheDocument()
    const input = screen.getByLabelText('Номер заказа')
    expect(input).toBeDisabled()
    expect(input).toHaveAttribute('placeholder', 'A-123')
  })

  it('список показывает подпись и варианты', () => {
    render(
      <RichMessage
        payload={{
          blocks: [
            {
              type: 'select',
              name: 'plan',
              label: 'Тариф',
              options: [
                { label: 'Базовый', value: 'basic' },
                { label: 'Про', value: 'pro' },
              ],
            },
          ],
        }}
      />,
    )

    expect(screen.getByLabelText('Тариф')).toBeDisabled()
    expect(screen.getByRole('option', { name: 'Базовый' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Про' })).toBeInTheDocument()
  })

  it('неизвестный тип блока не ломает рендер остальных', () => {
    const payload = {
      blocks: [{ type: 'video', url: 'https://example.com/a.mp4' }, CARD.blocks[0]],
    } as unknown as RichPayload

    render(<RichMessage payload={payload} />)
    expect(screen.getByText('Счёт готов')).toBeInTheDocument()
  })
})
