import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AllTheProviders } from './test-utils'
import { toast } from 'sonner'
import TicketMergeDialog from '@/components/TicketMergeDialog'

vi.mock('@/hooks/useFeature', () => ({ useFeature: () => true }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const dict: Record<string, string> = {
        'common.cancel': 'Отмена',
        'tickets.mergeCard': 'Объединение',
        'tickets.mergeDuplicate': 'Создать копию',
        'tickets.mergeTo': 'Объединить с…',
        'tickets.mergeTitle': 'Объединить тикеты',
        'tickets.mergeDesc': 'Сообщения и учтённое время будут перенесены в целевой тикет, текущий будет закрыт.',
        'tickets.mergeTargetId': 'ID целевого тикета',
        'tickets.mergeTargetPlaceholder': 'Например: 152',
        'tickets.mergeHint': 'После объединения исходный тикет закроется с пометкой «объединён».',
        'tickets.mergeConfirm': 'Объединить',
        'tickets.mergeDuplicated': 'Создана копия тикета #{{id}}',
        'tickets.mergeDone': 'Объединено: перенесено {{count}} сообщений в #{{target}}',
        'tickets.mergeInvalidId': 'Введите корректный id целевого тикета',
        'tickets.mergeError': 'Не удалось выполнить операцию',
      }
      let value = dict[key] || key
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          value = value.replaceAll(`{{${k}}}`, String(v))
        }
      }
      return value
    },
  }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

function mockApi() {
  globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
    const path = String(url)
    const method = init?.method || 'GET'
    if (path.includes('/duplicate')) {
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ success: true, data: { id: 999, title: 'Проблема (копия)', status: 'open' } }),
      })
    }
    if (path.includes('/merge') && method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ success: true, data: { targetTicketId: 152, targetTitle: 'Целевой', movedMessages: 3 } }),
      })
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({ message: 'not found' }) })
  }) as unknown as typeof fetch
}

async function renderDialog() {
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin' }))
  localStorage.setItem('token', 'token-123')
  const user = userEvent.setup()
  render(<TicketMergeDialog ticketId={1} />, { wrapper: AllTheProviders })
  return user
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
  mockApi()
})

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch
  vi.clearAllMocks()
})

describe('TicketMergeDialog (Этап 64, подфича 3)', () => {
  it('рендерит кнопки «Создать копию» и «Объединить с…»', async () => {
    await renderDialog()
    expect(screen.getByTestId('ticket-duplicate')).toBeInTheDocument()
    expect(screen.getByTestId('ticket-merge-open')).toBeInTheDocument()
    expect(screen.getByText('Создать копию')).toBeInTheDocument()
    expect(screen.getByText('Объединить с…')).toBeInTheDocument()
  })

  it('duplicate: клик по кнопке → POST /duplicate → toast с id копии', async () => {
    const user = await renderDialog()
    await user.click(screen.getByTestId('ticket-duplicate'))

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tickets/1/duplicate'),
        expect.objectContaining({ method: 'POST' }),
      )
    })
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Создана копия тикета #999')
    })
  })

  it('merge: открытие диалога, ввод id, подтверждение → POST /merge с targetTicketId', async () => {
    const user = await renderDialog()
    await user.click(screen.getByTestId('ticket-merge-open'))
    expect(await screen.findByText('Объединить тикеты')).toBeInTheDocument()

    const input = screen.getByTestId('merge-target-input')
    await user.type(input, '152')
    await user.click(screen.getByTestId('merge-confirm'))

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      const postCall = calls.find((c) => String(c[0]).includes('/merge') && c[1]?.method === 'POST')
      expect(postCall).toBeTruthy()
      expect(JSON.parse(postCall[1].body)).toEqual({ targetTicketId: 152 })
    })
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Объединено: перенесено 3 сообщений в #Целевой')
    })
  })

  it('merge с пустым id: кнопка «Объединить» disabled', async () => {
    const user = await renderDialog()
    await user.click(screen.getByTestId('ticket-merge-open'))
    await screen.findByText('Объединить тикеты')
    expect(screen.getByTestId('merge-confirm')).toBeDisabled()
  })

  it('merge: кнопка «Отмена» закрывает диалог', async () => {
    const user = await renderDialog()
    await user.click(screen.getByTestId('ticket-merge-open'))
    await screen.findByText('Объединить тикеты')
    await user.click(screen.getByTestId('merge-cancel'))
    await waitFor(() => {
      expect(screen.queryByText('Объединить тикеты')).not.toBeInTheDocument()
    })
  })

  it('невалидный id (не число): кнопка disabled при вводе «abc»', async () => {
    const user = await renderDialog()
    await user.click(screen.getByTestId('ticket-merge-open'))
    await screen.findByText('Объединить тикеты')
    const input = screen.getByTestId('merge-target-input')
    await user.type(input, 'abc')
    expect(screen.getByTestId('merge-confirm')).toBeDisabled()
  })
})
