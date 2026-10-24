import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import WidgetLauncher from '@/components/widget/WidgetLauncher'

const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    fetchDefaultWidgetChannel: vi.fn(),
  },
}))

vi.mock('@/lib/widget-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/widget-api')>()
  return { ...actual, ...mockApi }
})

vi.mock('@/components/widget/WidgetPanel', () => ({
  default: ({ websiteToken, onClose }: { websiteToken: string; onClose?: () => void }) => (
    <div>
      <span>panel:{websiteToken}</span>
      <button type="button" onClick={onClose}>
        close-panel
      </button>
    </div>
  ),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'widget.open': 'Открыть чат с поддержкой',
        'widget.close': 'Закрыть чат',
      })[key] || key,
  }),
}))

describe('WidgetLauncher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi.fetchDefaultWidgetChannel.mockResolvedValue({
      token: 'site-token',
      name: 'Сайт',
      color: '#1f93ff',
    })
  })

  it('не показывает кнопку, когда канал недоступен', async () => {
    mockApi.fetchDefaultWidgetChannel.mockRejectedValue(new Error('disabled'))
    const { container } = render(<WidgetLauncher />)
    await waitFor(() => expect(mockApi.fetchDefaultWidgetChannel).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('открывает и закрывает панель по кнопке', async () => {
    render(<WidgetLauncher />)

    const bubble = await screen.findByRole('button', { name: 'Открыть чат с поддержкой' })
    expect(bubble).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('panel:site-token')).not.toBeInTheDocument()

    fireEvent.click(bubble)

    expect(screen.getByText('panel:site-token')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Закрыть чат' })).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'close-panel' }))

    expect(screen.queryByText('panel:site-token')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Открыть чат с поддержкой' })).toBeInTheDocument()
  })
})
