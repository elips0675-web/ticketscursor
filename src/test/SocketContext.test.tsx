import { renderHook, act } from '@testing-library/react'
import { SocketProvider, useSocket } from '@/context/SocketContext'
import { AuthContext } from '@/context/AuthContext'
import type { ReactNode } from 'react'

const mockOn = vi.fn()
const mockOff = vi.fn()
const mockEmit = vi.fn()
const mockClose = vi.fn()
const mockIo = vi.fn(() => ({ on: mockOn, off: mockOff, emit: mockEmit, close: mockClose }))

vi.mock('socket.io-client', () => ({ io: (...args: unknown[]) => mockIo(...args) }))

function renderWithToken(token: string | null) {
  return renderHook(() => useSocket(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider
        value={{
          token,
          user: token ? { id: 1, name: 'T', email: 't@t.com', role: 'agent', avatar: null } : null,
          login: vi.fn(),
          logout: vi.fn(),
          loading: false,
        }}
      >
        <SocketProvider>{children}</SocketProvider>
      </AuthContext.Provider>
    ),
  })
}

function captureCallbacks() {
  const cbs: Record<string, (...args: unknown[]) => void> = {}
  mockOn.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
    cbs[event] = cb
  })
  return cbs
}

describe('SocketProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('does not connect without token', () => {
    const { result } = renderWithToken(null)
    expect(result.current.socket).toBeNull()
    expect(result.current.connected).toBe(false)
    expect(mockIo).not.toHaveBeenCalled()
  })

  it('connects with token', () => {
    renderWithToken('token')
    expect(mockIo).toHaveBeenCalledWith({ auth: { token: 'token' } })
  })

  it('calls sendMessage with clientId', () => {
    mockOn.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      if (event === 'connect') cb()
    })
    const { result } = renderWithToken('token')
    act(() => {
      result.current.sendMessage(1, 'hello', 'cid-1')
    })
    expect(mockEmit).toHaveBeenCalledWith('message:send', { chatId: 1, text: 'hello', clientId: 'cid-1' })
  })

  it('queues sent messages to outbox when disconnected', () => {
    const cbs = captureCallbacks()
    const { result } = renderWithToken('token')
    act(() => {
      result.current.sendMessage(1, 'hello', 'cid-1')
    })
    expect(mockEmit).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem('socket_offline_outbox') || '[]')).toEqual([
      expect.objectContaining({ clientId: 'cid-1', chatId: 1, text: 'hello' }),
    ])
    expect(cbs.connect).toBeDefined()
  })

  it('flushes outbox and clears entries after reconnect', () => {
    const cbs = captureCallbacks()
    const { result } = renderWithToken('token')
    act(() => {
      result.current.sendMessage(1, 'hello', 'cid-1')
      result.current.sendMessage(2, 'second', 'cid-2')
    })
    act(() => {
      cbs.connect()
    })
    expect(mockEmit).toHaveBeenCalledWith('message:send', { chatId: 1, text: 'hello', clientId: 'cid-1' })
    expect(mockEmit).toHaveBeenCalledWith('message:send', { chatId: 2, text: 'second', clientId: 'cid-2' })
    cbs['message:ack']?.({ clientId: 'cid-1' })
    expect(JSON.parse(localStorage.getItem('socket_offline_outbox') || '[]')).toEqual([
      expect.objectContaining({ clientId: 'cid-2' }),
    ])
  })

  it('calls joinChat and leaveChat', () => {
    mockOn.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      if (event === 'connect') cb()
    })
    const { result } = renderWithToken('token')
    act(() => {
      result.current.joinChat(5)
    })
    expect(mockEmit).toHaveBeenCalledWith('join:chat', 5)
    act(() => {
      result.current.leaveChat(5)
    })
    expect(mockEmit).toHaveBeenCalledWith('leave:chat', 5)
  })

  it('calls notifyAll', () => {
    mockOn.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      if (event === 'connect') cb()
    })
    const { result } = renderWithToken('token')
    act(() => {
      result.current.notifyAll({ title: 'Test', body: 'Body' })
    })
    expect(mockEmit).toHaveBeenCalledWith('notify:all', { title: 'Test', body: 'Body' })
  })

  it('closes socket on unmount', () => {
    const { unmount } = renderWithToken('token')
    unmount()
    expect(mockClose).toHaveBeenCalled()
  })
})
