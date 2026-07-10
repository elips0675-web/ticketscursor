import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import type { Ticket, TicketStats, Employee, TicketStatus, TicketPriority } from "@/types"
import { useAuth } from "@/context/AuthContext"
import { useSocket } from "@/context/SocketContext"
import { DEMO_TICKETS, DEMO_EMPLOYEES } from "@/lib/demo-data"

const API = "http://localhost:4000/api"

interface TicketContextType {
  tickets: Ticket[]
  employees: Employee[]
  stats: TicketStats
  updateTicketStatus: (id: number, status: TicketStatus) => Promise<void>
  updateTicketPriority: (id: number, priority: TicketPriority) => Promise<void>
  assignTicket: (id: number, employeeId: number) => Promise<void>
  addMessage: (ticketId: number, text: string, isInternal: boolean, attachments?: { url: string; name: string }[]) => Promise<void>
  createTicket: (data: { title: string; description: string; priority: TicketPriority; category: string; computerName?: string; userAccount?: string }) => Promise<void>
  loading: boolean
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
    createdBy: { id: raw.created_by, name: raw.created_by_name || "User", email: "", avatar: "" },
    assignedTo: raw.assigned_to ? { id: raw.assigned_to, name: raw.assigned_name || "", email: raw.assigned_email || "", avatar: raw.assigned_avatar || "" } : undefined,
    messages: Array.isArray(raw.messages) ? raw.messages.map((m: any) => ({
      id: m.id,
      ticketId: m.ticket_id,
      senderId: m.sender_id,
      senderName: m.sender_name,
      senderAvatar: m.sender_avatar || "",
      text: m.text,
      attachments: m.attachments ? (typeof m.attachments === 'string' ? JSON.parse(m.attachments) : m.attachments) : [],
      createdAt: m.created_at,
      isInternal: !!m.is_internal,
    })) : [],
    messages_count: raw.messages_count || (Array.isArray(raw.messages) ? raw.messages.length : 0),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

export function TicketProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!token) return
    try {
      const [tRes, eRes] = await Promise.all([
        fetch(`${API}/tickets?limit=500`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/employees`, { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (tRes.ok) {
        const { data } = await tRes.json()
        setTickets(data.map(mapTicket))
      } else {
        setTickets(DEMO_TICKETS)
      }
      if (eRes.ok) {
        const data = await eRes.json()
        setEmployees(data.map((e: any) => ({
          id: e.id,
          name: e.name,
          email: e.email,
          role: e.role as Employee["role"],
          department: e.department,
          avatar: e.avatar || "",
          online: !!e.online,
          activeTickets: e.activeTickets || 0,
          resolvedToday: e.resolvedToday || 0,
        })))
      } else {
        setEmployees(DEMO_EMPLOYEES)
      }
    } catch {
      setTickets(DEMO_TICKETS)
      setEmployees(DEMO_EMPLOYEES)
    }
    setLoading(false)
  }, [token])

  useEffect(() => { fetchAll() }, [fetchAll])

  const { socket } = useSocket()
  useEffect(() => {
    if (!socket) return
    const onStatus = ({ userId, online }: { userId: number; online: boolean }) => {
      setEmployees(prev => prev.map(e => e.id === userId ? { ...e, online } : e))
    }
    socket.on('user:status', onStatus)
    return () => { socket.off('user:status', onStatus) }
  }, [socket])

  const stats: TicketStats = {
    total: tickets.length,
    open: tickets.filter(t => t.status === 'open').length,
    inProgress: tickets.filter(t => t.status === 'in_progress').length,
    resolved: tickets.filter(t => t.status === 'resolved').length,
    critical: tickets.filter(t => t.priority === 'critical').length,
    avgResolutionTime: 4.5,
  }

  const updateTicketStatus = useCallback(async (id: number, status: TicketStatus) => {
    try {
      await fetch(`${API}/tickets/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      })
      setTickets(prev => prev.map(t => t.id === id ? { ...t, status, updatedAt: new Date().toISOString() } : t))
    } catch { /* ignore */ }
  }, [token])

  const updateTicketPriority = useCallback(async (id: number, priority: TicketPriority) => {
    try {
      await fetch(`${API}/tickets/${id}/priority`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ priority }),
      })
      setTickets(prev => prev.map(t => t.id === id ? { ...t, priority, updatedAt: new Date().toISOString() } : t))
    } catch { /* ignore */ }
  }, [token])

  const assignTicket = useCallback(async (id: number, employeeId: number) => {
    try {
      await fetch(`${API}/tickets/${id}/assign`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ employeeId }),
      })
      const emp = employees.find(e => e.id === employeeId)
      setTickets(prev => prev.map(t => t.id === id ? { ...t, assignedTo: emp, updatedAt: new Date().toISOString() } : t))
    } catch { /* ignore */ }
  }, [token, employees])

  const addMessage = useCallback(async (ticketId: number, text: string, isInternal: boolean, attachments?: { url: string; name: string }[]) => {
    try {
      const res = await fetch(`${API}/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text, isInternal, attachments }),
      })
      if (res.ok) {
        const { data: msg } = await res.json()
        setTickets(prev => prev.map(t => {
          if (t.id !== ticketId) return t
          const newMsg = {
            id: msg.id,
            ticketId: msg.ticket_id,
            senderId: msg.sender_id,
            senderName: msg.sender_name,
            senderAvatar: msg.sender_avatar || "",
            text: msg.text,
            attachments: msg.attachments ? (typeof msg.attachments === 'string' ? JSON.parse(msg.attachments) : msg.attachments) : [],
            createdAt: msg.created_at,
            isInternal: !!msg.is_internal,
          }
          return { ...t, messages: [...t.messages, newMsg], updatedAt: new Date().toISOString() }
        }))
      }
    } catch { /* ignore */ }
  }, [token])

  const createTicket = useCallback(async (data: { title: string; description: string; priority: TicketPriority; category: string; computerName?: string; userAccount?: string }) => {
    try {
      const res = await fetch(`${API}/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        const { data } = await res.json()
        const created = mapTicket(data)
        setTickets(prev => [created, ...prev])
      }
    } catch { /* ignore */ }
  }, [token])

  return (
    <TicketContext.Provider value={{ tickets, employees, stats, updateTicketStatus, updateTicketPriority, assignTicket, addMessage, createTicket, loading }}>
      {children}
    </TicketContext.Provider>
  )
}

export function useTickets() {
  const ctx = useContext(TicketContext)
  if (!ctx) throw new Error("useTickets must be used within TicketProvider")
  return ctx
}
