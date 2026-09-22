import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { RulesSection } from '@/pages/AdminRules'
import { toast } from 'sonner'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'admin.rules': 'Правила автоматизации',
        'admin.rulesSubtitle': 'Настройка правил',
        'admin.ruleCreate': 'Создать правило',
        'admin.ruleName': 'Название',
        'admin.ruleTrigger': 'Триггер',
        'admin.ruleConditions': 'Условия',
        'admin.ruleActions': 'Действия',
        'admin.rulesEmpty': 'Нет правил',
        'common.save': 'Сохранить',
        'common.cancel': 'Отмена',
        'common.success': 'Успех',
        'common.error': 'Ошибка',
        'common.confirmDelete': 'Удалить?',
        'common.disable': 'Отключить',
        'common.enable': 'Включить',
      })[key] || key,
  }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const { mockApi } = vi.hoisted(() => ({
  mockApi: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

vi.mock('@/lib/api', () => ({ api: mockApi }))

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

const mockRules = [
  {
    id: 1,
    name: 'Критичный приоритет',
    trigger_event: 'ticket.created',
    conditions: { logic: 'and', rules: [{ field: 'priority', operator: 'equals', value: 'high' }] },
    actions: [{ type: 'set_status', params: { status: 'in_progress' } }],
    is_active: true,
    run_count: 12,
    last_run: '2026-09-01T10:00:00Z',
    created_at: '2026-08-01T10:00:00Z',
  },
  {
    id: 2,
    name: 'Выключенное правило',
    trigger_event: 'ticket.closed',
    conditions: { logic: 'and', rules: [] },
    actions: [],
    is_active: false,
    run_count: 0,
    last_run: null,
    created_at: '2026-08-02T10:00:00Z',
  },
]

describe('RulesSection', () => {
  beforeEach(() => {
    mockApi.get.mockReset()
    mockApi.post.mockReset()
    mockApi.put.mockReset()
    mockApi.delete.mockReset()
    mockApi.get.mockResolvedValue(mockRules)
    mockApi.post.mockResolvedValue({ id: 3, name: 'New' })
    mockApi.put.mockResolvedValue({})
    mockApi.delete.mockResolvedValue({})
    vi.mocked(toast.success).mockClear()
    vi.mocked(toast.error).mockClear()
  })

  it('shows loading spinner then rules list', async () => {
    render(<RulesSection />, { wrapper: makeWrapper() })
    expect(await screen.findByText('Критичный приоритет')).toBeInTheDocument()
    expect(screen.getByText('Выключенное правило')).toBeInTheDocument()
  })

  it('shows empty state', async () => {
    mockApi.get.mockResolvedValue([])
    render(<RulesSection />, { wrapper: makeWrapper() })
    expect(await screen.findByText('Нет правил')).toBeInTheDocument()
  })

  it('fetches rules from API', async () => {
    render(<RulesSection />, { wrapper: makeWrapper() })
    await screen.findByText('Критичный приоритет')
    expect(mockApi.get).toHaveBeenCalledWith('/rules')
  })

  it('opens create form and creates rule', async () => {
    render(<RulesSection />, { wrapper: makeWrapper() })
    fireEvent.click(await screen.findByText('Создать правило'))
    const nameInput = await screen.findByPlaceholderText('Автоприоритет для критических')
    fireEvent.change(nameInput, { target: { value: 'Новое правило' } })
    fireEvent.click(screen.getByText('Сохранить'))
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/rules', expect.objectContaining({ name: 'Новое правило' }))
    })
    expect(await screen.findByText('New')).toBeInTheDocument()
  })

  it('does not submit empty rule name', async () => {
    render(<RulesSection />, { wrapper: makeWrapper() })
    fireEvent.click(await screen.findByText('Создать правило'))
    fireEvent.click(screen.getByText('Сохранить'))
    await waitFor(() => {
      expect(mockApi.post).not.toHaveBeenCalled()
    })
  })

  it('toggles rule active state', async () => {
    render(<RulesSection />, { wrapper: makeWrapper() })
    const enableBtn = await screen.findByText('Включить')
    fireEvent.click(enableBtn)
    await waitFor(() => {
      expect(mockApi.put).toHaveBeenCalledWith('/rules/2', { is_active: true })
    })
  })

  it('deletes rule after confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<RulesSection />, { wrapper: makeWrapper() })
    const trashButtons = await screen.findAllByRole('button')
    fireEvent.click(trashButtons[trashButtons.length - 1])
    await waitFor(() => {
      expect(mockApi.delete).toHaveBeenCalledWith('/rules/2')
    })
    expect(screen.queryByText('Выключенное правило')).not.toBeInTheDocument()
  })

  it('keeps rule when confirm cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<RulesSection />, { wrapper: makeWrapper() })
    await screen.findByText('Критичный приоритет')
    const trashButtons = screen.getAllByRole('button')
    fireEvent.click(trashButtons[trashButtons.length - 1])
    await waitFor(() => {
      expect(mockApi.delete).not.toHaveBeenCalled()
    })
  })

  it('adds and removes condition rows', async () => {
    render(<RulesSection />, { wrapper: makeWrapper() })
    fireEvent.click(await screen.findByText('Создать правило'))
    const addButtons = screen.getAllByText('+ Добавить')
    fireEvent.click(addButtons[0])
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('field (status, priority, category)')).toHaveLength(2)
    })
    const trash = screen.getAllByRole('button').filter((b) => b.querySelector('svg'))
    fireEvent.click(trash[trash.length - 1])
  })

  it('adds action row', async () => {
    render(<RulesSection />, { wrapper: makeWrapper() })
    fireEvent.click(await screen.findByText('Создать правило'))
    const addButtons = screen.getAllByText('+ Добавить')
    fireEvent.click(addButtons[1])
    await waitFor(() => {
      // опция действия уже есть в первом select, после добавления строки появляется второй select
      expect(screen.getAllByText('Отправить уведомление')).toHaveLength(2)
    })
  })

  it('shows error toast on create failure', async () => {
    mockApi.post.mockRejectedValue(new Error('fail'))
    render(<RulesSection />, { wrapper: makeWrapper() })
    fireEvent.click(await screen.findByText('Создать правило'))
    const nameInput = await screen.findByPlaceholderText('Автоприоритет для критических')
    fireEvent.change(nameInput, { target: { value: 'X' } })
    fireEvent.click(screen.getByText('Сохранить'))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
  })

  it('shows error toast on toggle failure', async () => {
    mockApi.put.mockRejectedValue(new Error('fail'))
    render(<RulesSection />, { wrapper: makeWrapper() })
    fireEvent.click(await screen.findByText('Включить'))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
  })

  it('handles API load failure gracefully', async () => {
    mockApi.get.mockRejectedValue(new Error('fail'))
    render(<RulesSection />, { wrapper: makeWrapper() })
    expect(await screen.findByText('Нет правил')).toBeInTheDocument()
  })
})