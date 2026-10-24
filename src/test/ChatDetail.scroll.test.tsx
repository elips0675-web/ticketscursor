import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from './setup'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/context/AuthContext'
import { SocketContext } from '@/context/SocketContext'
import ChatDetail from '@/pages/ChatDetail'

const scrollSpy = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-virtual', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-virtual')>()
  return {
    ...actual,
    useVirtualizer: (options: Parameters<typeof actual.useVirtualizer>[0]) => {
      const instance = actual.useVirtualizer(options)
      return new Proxy(instance, {
        get(target, prop, receiver) {
          if (prop === 'scrollToIndex') {
            return (...args: Parameters<typeof instance.scrollToIndex>) => {
              scrollSpy(...args)
              return target.scrollToIndex(...args)
            }
          }
          const value = Reflect.get(target, prop, receiver)
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
    },
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('framer-motion', () => ({
  motion: { div: 'div' },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}))

class FakeResizeObserver {
  private cb: (entries: Array<{ borderBoxSize: Array<{ blockSize: number; inlineSize: number }> }>) => void
  constructor(cb: (entries: Array<{ borderBoxSize: Array<{ blockSize: number; inlineSize: number }> }>) => void) {
    this.cb = cb
  }
  observe() {
    this.cb([{ borderBoxSize: [{ blockSize: 300, inlineSize: 800 }] }])
  }
  unobserve() {}
  disconnect() {}
}

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

function TestProviders({ children, mockSocket }: { children: React.ReactNode; mockSocket: ReturnType<typeof createMockSocket> }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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
              joinChat: vi.fn(),
              leaveChat: vi.fn(),
              notifyAll: vi.fn(),
              sendTyping: vi.fn(),
              markRead: vi.fn(),
            }}
          >
            <MemoryRouter initialEntries={['/chats/1']}>
              <Routes>
                <Route path="/chats/:id" element={children} />
              </Routes>
            </MemoryRouter>
          </SocketContext.Provider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

const API = 'http://localhost:4000/api'
const MESSAGES = Array.from({ length: 300 }, (_, i) => ({
  id: i + 1,
  chat_id: 1,
  sender_id: (i % 2) + 1,
  sender_name: i % 2 === 0 ? 'Admin' : 'Иван',
  text: `Сообщение ${i + 1}`,
  created_at: '2026-07-09T09:00:00Z',
}))

function scrollContainer(): HTMLElement {
  return document.querySelector('.overflow-y-auto') as HTMLElement
}

function setScrollMetrics(el: HTMLElement, { scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number }) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight })
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight })
}

async function renderChat() {
  server.use(
    http.get(`${API}/chats/:id`, () =>
      HttpResponse.json({
        id: 1,
        name: 'Общий чат',
        type: 'group',
        unread: 0,
        created_at: '2026-07-01T10:00:00Z',
        readers: [],
        messages: MESSAGES,
      }),
    ),
  )
  const socket = createMockSocket()
  render(<ChatDetail />, { wrapper: (p) => TestProviders({ ...p, mockSocket: socket }) })
  await screen.findByText('Сообщение 1')
  return { socket }
}

beforeEach(() => {
  localStorage.setItem('token', 'test-token')
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin' }))
  scrollSpy.mockReset()
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
})

describe('ChatDetail — автопрокрутка (CHW-12)', () => {
  it('у дна кнопки «вниз» нет, при прокрутке вверх — появляется', async () => {
    await renderChat()

    expect(screen.queryByLabelText('chats.scrollToBottom')).not.toBeInTheDocument()

    const el = scrollContainer()
    setScrollMetrics(el, { scrollHeight: 24000, clientHeight: 300 })
    el.scrollTop = 0
    fireEvent.scroll(el)

    expect(screen.getByLabelText('chats.scrollToBottom')).toBeInTheDocument()
  })

  it('прокручен вверх + чужое сообщение → позиция не меняется, бейдж растёт', async () => {
    const { socket } = await renderChat()

    const el = scrollContainer()
    setScrollMetrics(el, { scrollHeight: 24000, clientHeight: 300 })
    el.scrollTop = 1200
    fireEvent.scroll(el)
    scrollSpy.mockClear()

    act(() => {
      socket.listeners['message:new']({
        id: 999,
        chat_id: 1,
        sender_id: 2,
        sender_name: 'Иван',
        text: 'Новое сообщение',
        created_at: new Date().toISOString(),
      })
    })

    await waitFor(() => {
      const button = screen.getByLabelText('chats.scrollToBottom')
      expect(within(button).getByText('1')).toBeInTheDocument()
    })
    expect(scrollSpy).not.toHaveBeenCalled()
    expect(el.scrollTop).toBe(1200)

    const button = screen.getByLabelText('chats.scrollToBottom')
    expect(within(button).getByText('1')).toBeInTheDocument()
  })

  it('кнопка «вниз» прокручивает к последнему сообщению и сбрасывает бейдж', async () => {
    const { socket } = await renderChat()

    const el = scrollContainer()
    setScrollMetrics(el, { scrollHeight: 24000, clientHeight: 300 })
    el.scrollTop = 0
    fireEvent.scroll(el)

    act(() => {
      socket.listeners['message:new']({
        id: 999,
        chat_id: 1,
        sender_id: 2,
        sender_name: 'Иван',
        text: 'Новое сообщение',
        created_at: new Date().toISOString(),
      })
    })
    await waitFor(() => {
      const button = screen.getByLabelText('chats.scrollToBottom')
      expect(within(button).getByText('1')).toBeInTheDocument()
    })
    scrollSpy.mockClear()

    const user = userEvent.setup()
    await user.click(screen.getByLabelText('chats.scrollToBottom'))

    expect(scrollSpy).toHaveBeenCalledWith(300, { align: 'end' })
    expect(screen.queryByLabelText('chats.scrollToBottom')).not.toBeInTheDocument()
    expect(el.scrollTop).toBe(24000)
  })

  it('своё сообщение при прокрутке вверх всё равно прокручивает вниз', async () => {
    await renderChat()

    const el = scrollContainer()
    setScrollMetrics(el, { scrollHeight: 24000, clientHeight: 300 })
    el.scrollTop = 0
    fireEvent.scroll(el)
    expect(screen.getByLabelText('chats.scrollToBottom')).toBeInTheDocument()
    scrollSpy.mockClear()

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Написать сообщение...'), 'моё сообщение')
    await user.click(screen.getByLabelText('Отправить'))

    await waitFor(() => expect(scrollSpy).toHaveBeenCalledWith(300, { align: 'end' }))
  })
})
