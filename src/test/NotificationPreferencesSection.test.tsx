import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AllTheProviders } from './test-utils'
import NotificationPreferencesSection from '@/components/NotificationPreferencesSection'

let flagOn = true

vi.mock('@/hooks/useFeature', () => ({ useFeature: () => flagOn }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'profile.prefs.title': 'Настройки уведомлений',
        'profile.prefs.subtitle': 'Выберите каналы доставки для каждого события',
        'profile.prefs.eventColumn': 'Событие',
        'profile.prefs.allEvents': 'Все события',
        'profile.prefs.save': 'Сохранить',
        'profile.prefs.saved': 'Настройки сохранены',
        'profile.prefs.loadError': 'Не удалось загрузить настройки',
        'profile.prefs.saveError': 'Не удалось сохранить настройки',
        'profile.prefs.channel.email': 'Email',
        'profile.prefs.channel.push': 'Push',
        'profile.prefs.channel.in_app': 'В приложении',
        'profile.prefs.event.ticket_created': 'Тикет создан',
        'profile.prefs.event.ticket_status': 'Статус изменён',
        'profile.prefs.event.ticket_priority': 'Приоритет изменён',
        'profile.prefs.event.ticket_assigned': 'Назначение тикета',
        'profile.prefs.event.ticket_message': 'Новое сообщение',
        'profile.prefs.event.ticket_mention': 'Упоминание',
        'profile.prefs.event.ticket_sla_overdue': 'Нарушение SLA',
        'profile.prefs.event.ticket_sla_escalated': 'Эскалация SLA',
        'common.loading': 'Загрузка...',
      })[key] || key,
  }),
}))

const EVENTS = [
  'ticket_created',
  'ticket_status',
  'ticket_priority',
  'ticket_assigned',
  'ticket_message',
  'ticket_mention',
  'ticket_sla_overdue',
  'ticket_sla_escalated',
]
const CHANNELS = ['email', 'push', 'in_app']

function allTruePrefs() {
  const prefs: Record<string, Record<string, boolean>> = {}
  for (const ev of EVENTS) prefs[ev] = Object.fromEntries(CHANNELS.map((ch) => [ch, true]))
  return prefs
}

function mockApi(overrides: { failLoad?: boolean; failSave?: boolean } = {}) {
  globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
    const path = String(url)
    if (path.includes('/notifications/preferences')) {
      if (init?.method === 'PUT') {
        if (overrides.failSave) {
          return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ message: 'Server error' }) })
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: { prefs: JSON.parse(String(init.body)) } }),
        })
      }
      if (overrides.failLoad) {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ message: 'Server error' }) })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ success: true, data: { prefs: allTruePrefs(), events: EVENTS, channels: CHANNELS } }),
      })
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: {} }) })
  })
}

function checkedCount() {
  return screen.getAllByRole('checkbox').filter((cb) => cb.getAttribute('aria-checked') === 'true').length
}

describe('NotificationPreferencesSection (флаг notification_prefs)', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('token', 'token-123')
    localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin' }))
    flagOn = true
  })

  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch
    vi.clearAllMocks()
  })

  it('не рендерится, когда флаг выключен', () => {
    flagOn = false
    mockApi()
    const { container } = render(
      <AllTheProviders>
        <NotificationPreferencesSection />
      </AllTheProviders>,
    )
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText('Настройки уведомлений')).not.toBeInTheDocument()
  })

  it('рендерит таблицу событий × каналов с дефолтными чекбоксами (все включены)', async () => {
    mockApi()
    render(
      <AllTheProviders>
        <NotificationPreferencesSection />
      </AllTheProviders>,
    )
    await waitFor(() => expect(screen.getByText('Настройки уведомлений')).toBeInTheDocument())
    expect(screen.getByText('Тикет создан')).toBeInTheDocument()
    expect(screen.getByText('Эскалация SLA')).toBeInTheDocument()
    // 3 мастер-чекбокса колонок + 8 событий × 3 канала
    expect(screen.getAllByRole('checkbox')).toHaveLength(3 + 8 * 3)
    expect(checkedCount()).toBe(3 + 8 * 3)
    // Save отключён, пока ничего не менялось
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled()
  })

  it('переключает канал для события → dirty → Save активна → PUT с телом', async () => {
    mockApi()
    render(
      <AllTheProviders>
        <NotificationPreferencesSection />
      </AllTheProviders>,
    )
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByText('Настройки уведомлений')).toBeInTheDocument())

    await user.click(screen.getByLabelText('Тикет создан — Email'))
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(screen.getByText('Настройки сохранены')).toBeInTheDocument())

    const putCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      ([_url, init]) => (init as RequestInit)?.method === 'PUT',
    )
    expect(putCall).toBeTruthy()
    const body = JSON.parse(String((putCall as unknown[])[1] && ((putCall as unknown[])[1] as RequestInit).body))
    expect(body.ticket_created.email).toBe(false)
    expect(body.ticket_created.push).toBe(true)
  })

  it('мастер-чекбокс «Все события» переключает целую колонку', async () => {
    mockApi()
    render(
      <AllTheProviders>
        <NotificationPreferencesSection />
      </AllTheProviders>,
    )
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByText('Настройки уведомлений')).toBeInTheDocument())
    expect(checkedCount()).toBe(3 + 8 * 3)

    await user.click(screen.getByLabelText('Все события — Email'))
    // выключены 8 ячеек email + сам мастер-чекбокс колонки
    expect(checkedCount()).toBe(3 + 8 * 3 - 9)
    expect(screen.getByLabelText('Тикет создан — Email')).toHaveAttribute('aria-checked', 'false')

    await user.click(screen.getByLabelText('Все события — Email'))
    expect(checkedCount()).toBe(3 + 8 * 3)
  })

  it('показывает ошибку загрузки', async () => {
    mockApi({ failLoad: true })
    render(
      <AllTheProviders>
        <NotificationPreferencesSection />
      </AllTheProviders>,
    )
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить настройки'))
  })

  it('показывает ошибку сохранения', async () => {
    mockApi({ failSave: true })
    render(
      <AllTheProviders>
        <NotificationPreferencesSection />
      </AllTheProviders>,
    )
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByText('Настройки уведомлений')).toBeInTheDocument())
    await user.click(screen.getByLabelText('Тикет создан — Push'))
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Не удалось сохранить настройки'))
  })
})
