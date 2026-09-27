import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
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
        'chat.editMessage': 'Изменить сообщение',
        'chat.saveEdit': 'Сохранить правку',
        'chat.cancelEdit': 'Отменить правку',
        'chat.edited': 'изменено',
      })[k] || k,
  }),
}))

vi.mock('framer-motion', () => ({
  motion: { div: 'div' },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}))

// Флаг управляется по имени: chat_message_edit → editEnabled.
let editEnabled = true
vi.mock('@/hooks/useFeature', () => ({
  useFeature: (key: string) => (key === 'chat_message_edit' ? editEnabled : true),
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
                sendMessage: vi.fn(),
                deleteMessage: vi.fn(),
                editMessage: (chatId: number, msgId: number, text: string) =>
                  mockSocket.emit('message:edit', { chatId, msgId, text }),
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
  editEnabled = true
  vi.clearAllMocks()
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin' }))
})

describe('ChatDetail — редактирование сообщений (Этап 65, флаг chat_message_edit)', () => {
  it('кнопка «Изменить» только на своих сообщениях, при флаге ON', async () => {
    const sock = createMockSocket()
    render(<ChatDetail />, { wrapper: makeWrapper(sock) })
    expect(await screen.findByText('Привет всем!')).toBeInTheDocument()
    const editBtns = screen.getAllByLabelText('Изменить сообщение')
    expect(editBtns).toHaveLength(1) // только message id 1 (sender_id 1 = текущий пользователь)
    expect(screen.queryAllByLabelText('Изменить сообщение')).toHaveLength(1)
  })

  it('режим редактирования: ввод → сохранение → optimistic update + WS message:edit', async () => {
    const user = userEvent.setup()
    const sock = createMockSocket()
    render(<ChatDetail />, { wrapper: makeWrapper(sock) })
    await screen.findByText('Привет всем!')
    await user.click(screen.getByLabelText('Изменить сообщение'))
    expect(screen.getByPlaceholderText('Изменить сообщение')).toBeInTheDocument()
    const editInput = screen.getByPlaceholderText('Изменить сообщение')
    await user.clear(editInput)
    await user.type(editInput, 'Обновлённый текст')
    await user.click(screen.getByLabelText('Сохранить правку'))
    expect(sock.emit).toHaveBeenCalledWith('message:edit', { chatId: 1, msgId: 1, text: 'Обновлённый текст' })
    await waitFor(() => {
      expect(screen.getByText('Обновлённый текст')).toBeInTheDocument()
    })
    // optimistic: помечено «изменено»
    expect(screen.getAllByText('изменено').length).toBeGreaterThan(0)
  })

  it('WS message:edited — сообщение обновляется у всех участников', async () => {
    const sock = createMockSocket()
    render(<ChatDetail />, { wrapper: makeWrapper(sock) })
    await screen.findByText('Привет всем!')
    act(() => {
      sock.listeners['message:edited']({
        id: 1,
        chat_id: 1,
        sender_id: 1,
        sender_name: 'Admin',
        text: 'Исправлено через WS',
        created_at: '2026-07-09T09:00:00Z',
        edited_at: '2026-07-09T09:10:00Z',
      })
    })
    expect(await screen.findByText('Исправлено через WS')).toBeInTheDocument()
    expect(screen.getAllByText('изменено').length).toBeGreaterThan(0)
  })

  it('отмена редактирования — панель ввода возвращается', async () => {
    const user = userEvent.setup()
    const sock = createMockSocket()
    render(<ChatDetail />, { wrapper: makeWrapper(sock) })
    await screen.findByText('Привет всем!')
    await user.click(screen.getByLabelText('Изменить сообщение'))
    expect(screen.getByPlaceholderText('Изменить сообщение')).toBeInTheDocument()
    await user.click(screen.getByLabelText('Отменить правку'))
    expect(screen.queryByPlaceholderText('Изменить сообщение')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Написать сообщение...')).toBeInTheDocument()
  })

  it('при флаге OFF кнопки «Изменить» нет', async () => {
    editEnabled = false
    const sock = createMockSocket()
    render(<ChatDetail />, { wrapper: makeWrapper(sock) })
    await screen.findByText('Привет всем!')
    expect(screen.queryAllByLabelText('Изменить сообщение')).toHaveLength(0)
  })
})
