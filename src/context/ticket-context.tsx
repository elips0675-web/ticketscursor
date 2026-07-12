import { createContext, useContext, useEffect, useCallback, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Ticket, TicketStats, Employee, TicketStatus, TicketPriority } from '@/types'
import { useAuth } from '@/context/AuthContext'
import { useSocket } from '@/context/SocketContext'
import { API_URL } from '@/lib/api'

interface TicketContextType {
  tickets: Ticket[]
  employees: Employee[]
  stats: TicketStats
  loading: boolean
  updateTicketStatus: (id: number, status: TicketStatus) => Promise<void>
  updateTicketPriority: (id: number, priority: TicketPriority) => Promise<void>
  assignTicket: (id: number, employeeId: number) => Promise<void>
  addMessage: (
    ticketId: number,
    text: string,
    isInternal: boolean,
    attachments?: { url: string; name: string }[],
  ) => Promise<void>
  createTicket: (data: {
    title: string
    description: string
    priority: TicketPriority
    category: string
    computerName?: string
    userAccount?: string
  }) => Promise<void>
}

const TicketContext = createContext<TicketContextType | null>(null)

function mapTicket(raw: any): Ticket {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    status: raw.status,
    priority: raw.priority,
    category: raw.category,
    tags: [],
    computerName: raw.computer_name,
    userAccount: raw.user_account,
    createdBy: { id: raw.created_by, name: raw.created_by_name || 'User', email: '', avatar: '' },
    assignedTo: raw.assigned_to
      ? {
          id: raw.assigned_to,
          name: raw.assigned_name || '',
          email: raw.assigned_email || '',
          avatar: raw.assigned_avatar || '',
        }
      : undefined,
    messages: Array.isArray(raw.messages)
      ? raw.messages.map((m: any) => ({
          id: m.id,
          ticketId: m.ticket_id,
          senderId: m.sender_id,
          senderName: m.sender_name,
          senderAvatar: m.sender_avatar || '',
          text: m.text,
          attachments: m.attachments
            ? typeof m.attachments === 'string'
              ? JSON.parse(m.attachments)
              : m.attachments
            : [],
          createdAt: m.created_at,
          isInternal: !!m.is_internal,
        }))
      : [],
    messages_count: raw.messages_count || (Array.isArray(raw.messages) ? raw.messages.length : 0),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

function mapEmployee(e: any): Employee {
  return {
    id: e.id,
    name: e.name,
    email: e.email,
    role: e.role as Employee['role'],
    department: e.department,
    avatar: e.avatar || '',
    online: !!e.online,
    activeTickets: e.activeTickets || 0,
    resolvedToday: e.resolvedToday || 0,
  }
}

function authLogout() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  window.location.href = '/login'
}

async function authFetch(url: string, token: string | null, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: { ...options?.headers, Authorization: `Bearer ${token}` },
  })
  if (res.status === 401 || res.status === 403) {
    authLogout()
    throw new Error('Сессия истекла')
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export function TicketProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth()
  const queryClient = useQueryClient()

  const ticketsQuery = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      const body = await authFetch(`${API_URL}/tickets?limit=500`, token)
      return (body.data || []).map(mapTicket)
    },
    enabled: !!token,
  })

  const employeesQuery = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const body = await authFetch(`${API_URL}/employees`, token)
      const raw = body.data || body
      return raw.map(mapEmployee)
    },
    enabled: !!token,
  })

  const tickets = ticketsQuery.data ?? []
  const employees = employeesQuery.data ?? []
  const loading = ticketsQuery.isLoading || employeesQuery.isLoading

  const { socket } = useSocket()
  useEffect(() => {
    if (!socket) return
    const onStatus = ({ userId, online }: { userId: number; online: boolean }) => {
      queryClient.setQueryData<Employee[]>(['employees'], (prev) =>
        prev?.map((e) => (e.id === userId ? { ...e, online } : e)),
      )
    }
    socket.on('user:status', onStatus)
    return () => {
      socket.off('user:status', onStatus)
    }
  }, [socket, queryClient])

  const stats: TicketStats = {
    total: tickets.length,
    open: tickets.filter((t) => t.status === 'open').length,
    inProgress: tickets.filter((t) => t.status === 'in_progress').length,
    resolved: tickets.filter((t) => t.status === 'resolved').length,
    critical: tickets.filter((t) => t.priority === 'critical').length,
    avgResolutionTime: 4.5,
  }

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: TicketStatus }) =>
      authFetch(`${API_URL}/tickets/${id}/status`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['tickets'] })
      const prev = queryClient.getQueryData<Ticket[]>(['tickets'])
      queryClient.setQueryData<Ticket[]>(['tickets'], (old) =>
        old?.map((t) => (t.id === id ? { ...t, status, updatedAt: new Date().toISOString() } : t)),
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['tickets'], ctx.prev)
    },
  })

  const priorityMutation = useMutation({
    mutationFn: ({ id, priority }: { id: number; priority: TicketPriority }) =>
      authFetch(`${API_URL}/tickets/${id}/priority`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority }),
      }),
    onMutate: async ({ id, priority }) => {
      await queryClient.cancelQueries({ queryKey: ['tickets'] })
      const prev = queryClient.getQueryData<Ticket[]>(['tickets'])
      queryClient.setQueryData<Ticket[]>(['tickets'], (old) =>
        old?.map((t) => (t.id === id ? { ...t, priority, updatedAt: new Date().toISOString() } : t)),
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['tickets'], ctx.prev)
    },
  })

  const assignMutation = useMutation({
    mutationFn: ({ id, employeeId }: { id: number; employeeId: number }) =>
      authFetch(`${API_URL}/tickets/${id}/assign`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId }),
      }),
    onMutate: async ({ id, employeeId }) => {
      await queryClient.cancelQueries({ queryKey: ['tickets'] })
      const prev = queryClient.getQueryData<Ticket[]>(['tickets'])
      const emp = employees.find((e) => e.id === employeeId)
      queryClient.setQueryData<Ticket[]>(['tickets'], (old) =>
        old?.map((t) =>
          t.id === id
            ? {
                ...t,
                assignedTo: emp || t.assignedTo,
                updatedAt: new Date().toISOString(),
              }
            : t,
        ),
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['tickets'], ctx.prev)
    },
  })

  const addMessageMutation = useMutation({
    mutationFn: async ({
      ticketId,
      text,
      isInternal,
      attachments,
    }: {
      ticketId: number
      text: string
      isInternal: boolean
      attachments?: { url: string; name: string }[]
    }) => {
      const body = await authFetch(`${API_URL}/tickets/${ticketId}/messages`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, isInternal, attachments }),
      })
      return { ticketId, msg: body.data }
    },
    onMutate: async ({ ticketId, text, isInternal }) => {
      await queryClient.cancelQueries({ queryKey: ['tickets'] })
      const prev = queryClient.getQueryData<Ticket[]>(['tickets'])
      const tempMsg = {
        id: -Date.now(),
        ticketId,
        senderId: user?.id || 0,
        senderName: user?.name || 'User',
        senderAvatar: '',
        text,
        attachments: [],
        createdAt: new Date().toISOString(),
        isInternal,
      }
      queryClient.setQueryData<Ticket[]>(['tickets'], (old) =>
        old?.map((t) =>
          t.id === ticketId ? { ...t, messages: [...t.messages, tempMsg], updatedAt: new Date().toISOString() } : t,
        ),
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['tickets'], ctx.prev)
    },
    onSuccess: ({ ticketId, msg }) => {
      queryClient.setQueryData<Ticket[]>(['tickets'], (old) =>
        old?.map((t) => {
          if (t.id !== ticketId) return t
          const realMsg = {
            id: msg.id,
            ticketId: msg.ticket_id,
            senderId: msg.sender_id,
            senderName: msg.sender_name,
            senderAvatar: msg.sender_avatar || '',
            text: msg.text,
            attachments: msg.attachments
              ? typeof msg.attachments === 'string'
                ? JSON.parse(msg.attachments)
                : msg.attachments
              : [],
            createdAt: msg.created_at,
            isInternal: !!msg.is_internal,
          }
          return {
            ...t,
            messages: t.messages.map((m) => (m.id < 0 ? realMsg : m)),
            updatedAt: new Date().toISOString(),
          }
        }),
      )
    },
  })

  const createTicketMutation = useMutation({
    mutationFn: (data: {
      title: string
      description: string
      priority: TicketPriority
      category: string
      computerName?: string
      userAccount?: string
    }) =>
      authFetch(`${API_URL}/tickets`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((body) => body.data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ['tickets'] })
      const prev = queryClient.getQueryData<Ticket[]>(['tickets'])
      const tempTicket: Ticket = {
        id: -Date.now(),
        title: data.title,
        description: data.description,
        status: 'open',
        priority: data.priority,
        category: data.category,
        tags: [],
        computerName: data.computerName,
        userAccount: data.userAccount,
        createdBy: { id: user?.id || 0, name: user?.name || '', email: '', avatar: '' },
        assignedTo: undefined,
        messages: [],
        messages_count: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      queryClient.setQueryData<Ticket[]>(['tickets'], (old) => (old ? [tempTicket, ...old] : [tempTicket]))
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['tickets'], ctx.prev)
    },
    onSuccess: (raw) => {
      const created = mapTicket(raw)
      queryClient.setQueryData<Ticket[]>(['tickets'], (old) => old?.map((t) => (t.id < 0 ? created : t)))
    },
  })

  const updateTicketStatus = useCallback(
    (id: number, status: TicketStatus) => statusMutation.mutateAsync({ id, status }),
    [statusMutation],
  )

  const updateTicketPriority = useCallback(
    (id: number, priority: TicketPriority) => priorityMutation.mutateAsync({ id, priority }),
    [priorityMutation],
  )

  const assignTicket = useCallback(
    (id: number, employeeId: number) => assignMutation.mutateAsync({ id, employeeId }),
    [assignMutation],
  )

  const addMessage = useCallback(
    (ticketId: number, text: string, isInternal: boolean, attachments?: { url: string; name: string }[]) =>
      addMessageMutation.mutateAsync({ ticketId, text, isInternal, attachments }),
    [addMessageMutation],
  )

  const createTicket = useCallback(
    (data: {
      title: string
      description: string
      priority: TicketPriority
      category: string
      computerName?: string
      userAccount?: string
    }) => createTicketMutation.mutateAsync(data),
    [createTicketMutation],
  )

  return (
    <TicketContext.Provider
      value={{
        tickets,
        employees,
        stats,
        updateTicketStatus,
        updateTicketPriority,
        assignTicket,
        addMessage,
        createTicket,
        loading,
      }}
    >
      {children}
    </TicketContext.Provider>
  )
}

export function useTickets() {
  const ctx = useContext(TicketContext)
  if (!ctx) throw new Error('useTickets must be used within TicketProvider')
  return ctx
}
