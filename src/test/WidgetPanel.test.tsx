import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import WidgetPanel from '@/components/widget/WidgetPanel'
import { WidgetApiError } from '@/lib/widget-api'

const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    fetchWidgetConfig: vi.fn(),
    createWidgetConversation: vi.fn(),
    fetchWidgetThread: vi.fn(),
    sendWidgetMessage: vi.fn(),
    fetchDefaultWidgetChannel: vi.fn(),
  },
}))

vi.mock('@/lib/widget-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/widget-api')>()
  return { ...actual, ...mockApi }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'widget.subtitle': 'Ответим, как только сможем',
        'widget.open': 'Открыть чат с поддержкой',
        'widget.close': 'Закрыть чат',
        'widget.name': 'Ваше имя',
        'widget.namePlaceholder': 'Иван Иванов',
        'widget.email': 'Email (необязательно)',
        'widget.emailPlaceholder': 'ivan@company.com',
        'widget.start': 'Начать чат',
        'widget.starting': 'Открываем чат…',
        'widget.nameRequired': 'Укажите имя',
        'widget.invalidEmail': 'Проверьте адрес email',
        'widget.messagePlaceholder': 'Напишите сообщение…',
        'widget.send': 'Отправить сообщение',
        'widget.sendError': 'Сообщение не отправлено. Попробуйте ещё раз.',
        'widget.loadError': 'Не удалось загрузить чат',
        'widget.loadErrorHint': 'Проверьте соединение и обновите страницу.',
        'widget.notFound': 'Чат недоступен',
        'widget.notFoundHint': 'Проверьте ссылку или обратитесь к администратору сайта.',
        'widget.closed': 'Диалог завершён',
        'widget.closedHint': 'Оператор закрыл обращение. Можно начать новый диалог.',
        'widget.newConversation': 'Новый диалог',
      })[key] || key,
  }),
}))

const CONFIG = {
  name: 'Сайт',
  welcome: 'Здравствуйте! Напишите нам.',
  offline: 'Мы офлайн',
  color: '#1f93ff',
}

const CONVERSATION = {
  token: 'conv-token-1',
  name: 'Иван',
  status: 'open' as const,
  created_at: '2026-10-24T10:00:00.000Z',
}

const VISITOR_MESSAGE = {
  id: 1,
  sender_type: 'visitor' as const,
  sender_name: 'Иван',
  text: 'Не работает принтер',
  created_at: '2026-10-24T10:01:00.000Z',
}

const AGENT_MESSAGE = {
  id: 2,
  sender_type: 'agent' as const,
  sender_name: 'Мария',
  text: 'Здравствуйте, проверяю',
  created_at: '2026-10-24T10:02:00.000Z',
}

const STORAGE_KEY = 'sd_widget_conversation_site-token'

describe('WidgetPanel', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
    mockApi.fetchWidgetConfig.mockResolvedValue(CONFIG)
    mockApi.fetchWidgetThread.mockResolvedValue({ name: 'Иван', status: 'open', messages: [] })
    mockApi.createWidgetConversation.mockResolvedValue(CONVERSATION)
    mockApi.sendWidgetMessage.mockImplementation((_website: string, _conversation: string, text: string) =>
      Promise.resolve({ ...VISITOR_MESSAGE, id: 9, text }),
    )
  })

  it('показывает стартовый экран с приветствием и формой', async () => {
    render(<WidgetPanel websiteToken="site-token" />)
    expect(await screen.findByRole('heading', { name: 'Сайт' })).toBeInTheDocument()
    expect(screen.getByText('Здравствуйте! Напишите нам.')).toBeInTheDocument()
    expect(screen.getByLabelText('Ваше имя')).toBeInTheDocument()
    expect(screen.getByLabelText('Email (необязательно)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Начать чат' })).toBeInTheDocument()
  })

  it('404 конфига показывает «Чат недоступен», а не пустую панель', async () => {
    mockApi.fetchWidgetConfig.mockRejectedValue(new WidgetApiError(404, 'not found'))
    render(<WidgetPanel websiteToken="site-token" />)
    expect(await screen.findByText('Чат недоступен')).toBeInTheDocument()
    expect(screen.getByText('Проверьте ссылку или обратитесь к администратору сайта.')).toBeInTheDocument()
  })

  it('не создаёт диалог без имени', async () => {
    render(<WidgetPanel websiteToken="site-token" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Начать чат' }))
    expect(await screen.findByText('Укажите имя')).toBeInTheDocument()
    expect(mockApi.createWidgetConversation).not.toHaveBeenCalled()
  })

  it('не создаёт диалог с некорректным email', async () => {
    render(<WidgetPanel websiteToken="site-token" />)
    fireEvent.change(await screen.findByLabelText('Ваше имя'), { target: { value: 'Иван' } })
    fireEvent.change(screen.getByLabelText('Email (необязательно)'), { target: { value: 'bad-email' } })
    fireEvent.click(screen.getByRole('button', { name: 'Начать чат' }))
    expect(await screen.findByText('Проверьте адрес email')).toBeInTheDocument()
    expect(mockApi.createWidgetConversation).not.toHaveBeenCalled()
  })

  it('создаёт диалог и запоминает токен посетителя', async () => {
    render(<WidgetPanel websiteToken="site-token" />)
    fireEvent.change(await screen.findByLabelText('Ваше имя'), { target: { value: '  Иван  ' } })
    fireEvent.change(screen.getByLabelText('Email (необязательно)'), { target: { value: 'ivan@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Начать чат' }))

    await waitFor(() =>
      expect(mockApi.createWidgetConversation).toHaveBeenCalledWith(
        'site-token',
        expect.objectContaining({ name: 'Иван', email: 'ivan@example.com' }),
      ),
    )
    expect(mockApi.createWidgetConversation).toHaveBeenCalledWith(
      'site-token',
      expect.objectContaining({ visitor_id: expect.any(String) }),
    )
    expect(await screen.findByPlaceholderText('Напишите сообщение…')).toBeInTheDocument()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('conv-token-1')
  })

  it('поднимает сохранённый диалог и показывает переписку', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'conv-token-1')
    mockApi.fetchWidgetThread.mockResolvedValue({
      name: 'Иван',
      status: 'open',
      messages: [VISITOR_MESSAGE, AGENT_MESSAGE],
    })

    render(<WidgetPanel websiteToken="site-token" />)

    expect(await screen.findByText('Не работает принтер')).toBeInTheDocument()
    expect(screen.getByText('Здравствуйте, проверяю')).toBeInTheDocument()
    expect(screen.getByText('Мария')).toBeInTheDocument()
    expect(mockApi.fetchWidgetThread).toHaveBeenCalledWith('site-token', 'conv-token-1')
  })

  it('рендерит rich-карточку оператора', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'conv-token-1')
    mockApi.fetchWidgetThread.mockResolvedValue({
      name: 'Иван',
      status: 'open',
      messages: [
        VISITOR_MESSAGE,
        {
          ...AGENT_MESSAGE,
          content_type: 'rich_json',
          rich_payload: {
            blocks: [{ type: 'card', title: 'Счёт готов', text: 'Оплатите до 5 ноября.' }],
          },
        },
      ],
    })

    render(<WidgetPanel websiteToken="site-token" />)

    expect(await screen.findByText('Счёт готов')).toBeInTheDocument()
    expect(screen.getByText('Оплатите до 5 ноября.')).toBeInTheDocument()
  })

  it('удаляет протухший токен диалога и возвращает форму', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'conv-token-1')
    mockApi.fetchWidgetThread.mockRejectedValue(new WidgetApiError(404, 'not found'))

    render(<WidgetPanel websiteToken="site-token" />)

    expect(await screen.findByRole('heading', { name: 'Сайт' })).toBeInTheDocument()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('отправляет сообщение по Enter и очищает поле', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'conv-token-1')
    render(<WidgetPanel websiteToken="site-token" />)

    const input = await screen.findByPlaceholderText('Напишите сообщение…')
    fireEvent.change(input, { target: { value: 'Нужна помощь' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })

    await waitFor(() =>
      expect(mockApi.sendWidgetMessage).toHaveBeenCalledWith('site-token', 'conv-token-1', 'Нужна помощь'),
    )
    expect(await screen.findByText('Нужна помощь')).toBeInTheDocument()
    expect((input as HTMLTextAreaElement).value).toBe('')
  })

  it('Shift+Enter не отправляет сообщение', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'conv-token-1')
    render(<WidgetPanel websiteToken="site-token" />)

    const input = await screen.findByPlaceholderText('Напишите сообщение…')
    fireEvent.change(input, { target: { value: 'Перенос строки' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })

    expect(mockApi.sendWidgetMessage).not.toHaveBeenCalled()
  })

  it('409 при отправке переводит панель в закрытый диалог', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'conv-token-1')
    mockApi.sendWidgetMessage.mockRejectedValue(new WidgetApiError(409, 'closed'))
    render(<WidgetPanel websiteToken="site-token" />)

    const input = await screen.findByPlaceholderText('Напишите сообщение…')
    fireEvent.change(input, { target: { value: 'Ау?' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })

    expect(
      await screen.findByText('Оператор закрыл обращение. Можно начать новый диалог.'),
    ).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Напишите сообщение…')).not.toBeInTheDocument()
  })

  it('закрытый диалог показывает баннер и начинает новый по кнопке', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'conv-token-1')
    mockApi.fetchWidgetThread.mockResolvedValue({
      name: 'Иван',
      status: 'closed',
      messages: [VISITOR_MESSAGE],
    })

    render(<WidgetPanel websiteToken="site-token" />)

    expect(await screen.findByRole('button', { name: 'Новый диалог' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Напишите сообщение…')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Новый диалог' }))

    expect(await screen.findByRole('heading', { name: 'Сайт' })).toBeInTheDocument()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('кнопка закрытия вызывает onClose', async () => {
    const onClose = vi.fn()
    render(<WidgetPanel websiteToken="site-token" onClose={onClose} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Закрыть чат' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
