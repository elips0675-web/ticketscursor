import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { AuthProvider } from '@/context/AuthContext'
import { SocketContext } from '@/context/SocketContext'
import { TicketProvider, useTickets } from '@/context/ticket-context'
import { server } from './setup'

const API = 'http://localhost:4000/api'

function MockSocketProvider({ children }: { children: ReactNode }) {
  return (
    <SocketContext.Provider
      value={{
        socket: null,
        connected: false,
        sendMessage: () => {},
        deleteMessage: () => {},
        joinChat: () => {},
        leaveChat: () => {},
        notifyAll: () => {},
        sendTyping: () => {},
      }}
    >
      {children}
    </SocketContext.Provider>
  )
}

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MockSocketProvider>
            <TicketProvider>{children}</TicketProvider>
          </MockSocketProvider>
        </AuthProvider>
      </QueryClientProvider>
    )
  }
}

beforeEach(() => {
  localStorage.setItem('token', 'test-token')
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin' }))
})

async function renderLoaded(expectedTickets = 2) {
  const utils = renderHook(() => useTickets(), { wrapper: makeWrapper() })
  await waitFor(() => {
    expect(utils.result.current.tickets).toHaveLength(expectedTickets)
  })
  if (expectedTickets === 2) {
    await waitFor(() => {
      expect(utils.result.current.employees).toHaveLength(3)
    })
  }
  return utils
}

describe('ticket-context: optimistic-мутации (Этап 61)', () => {
  it('загружает тикеты, сотрудников и считает stats', async () => {
    const { result } = await renderLoaded()
    expect(result.current.tickets.length).toBe(2)
    expect(result.current.employees.length).toBe(3)
    expect(result.current.stats.total).toBe(2)
    expect(result.current.stats.open).toBe(1)
    expect(result.current.stats.inProgress).toBe(1)
    expect(result.current.stats.resolved).toBe(0)
    expect(result.current.stats.critical).toBe(0)
  })

  it('updateTicketStatus: optimistic-обновление статуса до ответа сервера', async () => {
    const { result } = await renderLoaded()
    await act(async () => {
      await result.current.updateTicketStatus(1, 'resolved')
    })
    await waitFor(() => {
      expect(result.current.tickets.find((t) => t.id === 1)?.status).toBe('resolved')
    })
  })

  it('updateTicketStatus: откат к прежнему статусу при ошибке API', async () => {
    server.use(http.put(`${API}/tickets/:id/status`, () => HttpResponse.json({ message: 'boom' }, { status: 500 })))
    const { result } = await renderLoaded()
    await act(async () => {
      await expect(result.current.updateTicketStatus(1, 'resolved')).rejects.toThrow()
    })
    expect(result.current.tickets.find((t) => t.id === 1)?.status).toBe('open')
  })

  it('updateTicketPriority: optimistic-обновление приоритета', async () => {
    const { result } = await renderLoaded()
    await act(async () => {
      await result.current.updateTicketPriority(1, 'critical')
    })
    await waitFor(() => {
      expect(result.current.tickets.find((t) => t.id === 1)?.priority).toBe('critical')
    })
  })

  it('assignTicket: подставляет сотрудника из employees', async () => {
    const { result } = await renderLoaded()
    await act(async () => {
      await result.current.assignTicket(1, 2)
    })
    await waitFor(() => {
      expect(result.current.tickets.find((t) => t.id === 1)?.assignedTo?.name).toBe('Иван Иванов')
    })
  })

  it('updateTicketTags: заменяет теги мгновенно', async () => {
    const { result } = await renderLoaded()
    await act(async () => {
      await result.current.updateTicketTags(1, ['urgent', 'network'])
    })
    await waitFor(() => {
      expect(result.current.tickets.find((t) => t.id === 1)?.tags).toEqual(['urgent', 'network'])
    })
  })

  it('bulkUpdateTickets: action=status применяется ко всем ids', async () => {
    const { result } = await renderLoaded()
    await act(async () => {
      const res = await result.current.bulkUpdateTickets({ ids: [1, 2], action: 'status', status: 'resolved' })
      expect(res.updated).toBe(2)
    })
    await waitFor(() => {
      expect(result.current.tickets.every((t) => t.status === 'resolved')).toBe(true)
    })
  })

  it('bulkUpdateTickets: status=reopened сбрасывает escalationLevel', async () => {
    server.use(
      http.get(`${API}/tickets`, () =>
        HttpResponse.json({
          data: [
            {
              id: 1,
              title: 'Проблема с доступом',
              description: 'Не могу войти в систему',
              status: 'open',
              priority: 'high',
              category: 'incident',
              tags: ['vpn'],
              escalation_level: 2,
              created_by: 1,
              assigned_to: null,
              created_at: '2026-07-01T10:00:00Z',
              updated_at: '2026-07-01T10:00:00Z',
              messages: [],
            },
          ],
          total: 1,
        }),
      ),
    )
    const { result } = await renderLoaded(1)
    await waitFor(() => {
      expect(result.current.tickets[0].escalationLevel).toBe(2)
    })
    await act(async () => {
      await result.current.bulkUpdateTickets({ ids: [1], action: 'status', status: 'reopened' })
    })
    await waitFor(() => {
      expect(result.current.tickets[0].status).toBe('reopened')
      expect(result.current.tickets[0].escalationLevel).toBe(0)
    })
  })

  it('bulkUpdateTickets: action=assign ставит сотрудника или снимает при null', async () => {
    const { result } = await renderLoaded()
    await act(async () => {
      await result.current.bulkUpdateTickets({ ids: [1], action: 'assign', employeeId: 3 })
    })
    await waitFor(() => {
      expect(result.current.tickets.find((t) => t.id === 1)?.assignedTo?.name).toBe('Пётр Петров')
    })
    await act(async () => {
      await result.current.bulkUpdateTickets({ ids: [1], action: 'assign', employeeId: null })
    })
    await waitFor(() => {
      expect(result.current.tickets.find((t) => t.id === 1)?.assignedTo).toBeUndefined()
    })
  })

  it('addMessage: временное сообщение заменяется серверным', async () => {
    const { result } = await renderLoaded()
    await act(async () => {
      await result.current.addMessage(1, 'Новое сообщение', false)
    })
    await waitFor(() => {
      const ticket = result.current.tickets.find((t) => t.id === 1)
      expect(ticket?.messages.length).toBe(1)
      expect(ticket?.messages[0].id).toBe(10)
      expect(ticket?.messages[0].text).toBe('Новое сообщение')
    })
  })

  it('addMessage: откат убирает временное сообщение при ошибке', async () => {
    server.use(http.post(`${API}/tickets/:id/messages`, () => HttpResponse.json({ message: 'boom' }, { status: 500 })))
    const { result } = await renderLoaded()
    await act(async () => {
      await expect(result.current.addMessage(1, 'Временное', false)).rejects.toThrow()
    })
    expect(result.current.tickets.find((t) => t.id === 1)?.messages).toHaveLength(0)
  })

  it('createTicket: временный тикет добавлен и заменён серверным', async () => {
    const { result } = await renderLoaded()
    expect(result.current.tickets[0].id).toBe(1)
    await act(async () => {
      await result.current.createTicket({
        title: 'Новый тикет',
        description: 'Описание',
        priority: 'medium',
        category: 'support',
      })
    })
    await waitFor(() => {
      expect(result.current.tickets).toHaveLength(3)
      expect(result.current.tickets[0].id).toBe(3)
      expect(result.current.tickets[0].title).toBe('Новый тикет')
    })
  })

  it('createTicket: откат при ошибке API', async () => {
    server.use(http.post(`${API}/tickets`, () => HttpResponse.json({ message: 'boom' }, { status: 500 })))
    const { result } = await renderLoaded()
    await act(async () => {
      await expect(
        result.current.createTicket({
          title: 'Новый тикет',
          description: 'Описание',
          priority: 'medium',
          category: 'support',
        }),
      ).rejects.toThrow()
    })
    expect(result.current.tickets).toHaveLength(2)
    expect(result.current.tickets[0].id).toBe(1)
  })

  it('401 на мутации: чистит сессию и отклоняет promise', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    server.use(
      http.put(`${API}/tickets/:id/status`, () => HttpResponse.json({ message: 'unauthorized' }, { status: 401 })),
    )
    const { result } = await renderLoaded()
    await act(async () => {
      await expect(result.current.updateTicketStatus(1, 'resolved')).rejects.toThrow('Сессия истекла')
    })
    expect(localStorage.getItem('token')).toBeNull()
    expect(result.current.tickets.find((t) => t.id === 1)?.status).toBe('open')
    consoleError.mockRestore()
  })
})
