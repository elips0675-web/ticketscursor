import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/context/AuthContext'
import { SocketContext } from '@/context/SocketContext'
import ChatDetail from '@/pages/ChatDetail'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) =>
      ({
        'chat.reply': 'Ответить',
        'chat.replyTo': 'В ответ на',
        'chat.cancelReply': 'Отменить ответ',
        'chat.edited': 'изменено',
        'chat.editMessage': 'Изменить сообщение',
        'chat.saveEdit': 'Сохранить',
        'chat.cancelEdit': 'Отменить',
      })[k] || k,
  }),
}))

vi.mock('framer-motion', () => ({
  motion: { div: 'div' },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}))

let replyEnabled = true
let editEnabled = false
vi.mock('@/hooks/useFeature', () => ({
  useFeature: (key: string) => {
    if (key === 'chat_reply_to') return replyEnabled
    if (key === 'chat_message_edit') return editEnabled
    return true
  },
  useAllFeatures: () => ({ data: [] }),
}))

function createMockSocket() {
  const listeners: Record<string, (...args: unknown[]) => void> = {}
  return {
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      listeners[event] = cb
    }),
    off: vi.fn(),
    emit: vi.fn(),
    connected: true,
    listeners,
  }
}

function makeWrapper(mockSocket: ReturnType<typeof createMockSocket>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ _children }: { _children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <SocketContext.Provider
              value={{
                socket: mockSocket,
                connected: true,
                sendMessage: (chatId: number, text: string, clientId?: string, replyToId?: number) =>
                  mockSocket.emit('message:send', { chatId, text, clientId, replyToId }),
                deleteMessage: vi.fn(),
                editMessage: vi.fn(),
                joinChat: vi.fn(),
                leaveChat: vi.fn(),
                notifyAll: vi.fn(),
                sendTyping: vi.fn(),
                markRead: vi.fn(),
              }}
            >
              <MemoryRouter initialEntries={['/chats/1']}>
                <Routes>
                  <Route path="/chats/:id" element={<ChatDetail />} />
                </Routes>
              </MemoryRouter>
            </SocketContext.Provider>
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    )
  }
}

beforeEach(() => {
  replyEnabled = true
  editEnabled = false
  vi.clearAllMocks()
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin' }))
})

describe('ChatDetail — reply-to/threads (Этап 65, флаг chat_reply_to)', () => {
  it('кнопка «Ответить» на любом сообщении, при флаге ON', async () => {
    const sock = createMockSocket()
    render(<ChatDetail />, { wrapper: makeWrapper(sock) })
    await screen.findByText('Привет всем!')
    expect(screen.getAllByLabelText('Ответить').length).toBeGreaterThanOrEqual(2)
  })

  it('цитирование: превью ответа → отправка с replyToId → optimistic цитата в сообщении', async () => {
    const user = userEvent.setup()
    const sock = createMockSocket()
    render(<ChatDetail />, { wrapper: makeWrapper(sock) })
    await screen.findByText('Привет всем!')
    // Ответ на сообщение Ивана (id 2)
    await user.click(screen.getAllByLabelText('Ответить')[1])
    expect(screen.getByText('В ответ на: Иван')).toBeInTheDocument()
    expect(screen.getAllByText('Привет!').length).toBeGreaterThanOrEqual(2)
    const input = screen.getByPlaceholderText('Написать сообщение...')
    await user.type(input, 'Согласен')
    await user.click(screen.getByLabelText('Отправить'))
    expect(sock.emit).toHaveBeenCalledWith(
      'message:send',
      expect.objectContaining({ chatId: 1, text: 'Согласен', replyToId: 2 }),
    )
    // optimistic: у нового сообщения есть цитата
    const myBubble = screen.getByText('Согласен').closest('div')
    expect(myBubble?.textContent).toContain('Иван')
    await waitFor(() => {
      expect(screen.queryByText('В ответ на: Иван')).not.toBeInTheDocument()
    })
  })

  it('отмена ответа — превью исчезает', async () => {
    const user = userEvent.setup()
    const sock = createMockSocket()
    render(<ChatDetail />, { wrapper: makeWrapper(sock) })
    await screen.findByText('Привет всем!')
    await user.click(screen.getAllByLabelText('Ответить')[0])
    expect(screen.getByText('В ответ на: Admin')).toBeInTheDocument()
    await user.click(screen.getByLabelText('Отменить ответ'))
    expect(screen.queryByText('В ответ на: Admin')).not.toBeInTheDocument()
  })

  it('при флаге OFF кнопок «Ответить» нет', async () => {
    replyEnabled = false
    const sock = createMockSocket()
    render(<ChatDetail />, { wrapper: makeWrapper(sock) })
    await screen.findByText('Привет всем!')
    expect(screen.queryAllByLabelText('Ответить')).toHaveLength(0)
  })

  it('WS message:new с reply_to — цитата рендерится у получателя', async () => {
    const sock = createMockSocket()
    render(<ChatDetail />, { wrapper: makeWrapper(sock) })
    await screen.findByText('Привет всем!')
    sock.listeners['message:new']({
      id: 100,
      chat_id: 1,
      sender_id: 2,
      sender_name: 'Иван',
      text: 'отвечаю на Admin',
      created_at: '2026-07-09T09:05:00Z',
      reply_to: { id: 1, sender_id: 1, sender_name: 'Admin', text: 'Привет всем!' },
    })
    expect(await screen.findByText('отвечаю на Admin')).toBeInTheDocument()
    expect(screen.getAllByText('Admin').length).toBeGreaterThan(0)
  })
})
