export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical'
export type TicketCategory = 'bug' | 'feature' | 'support' | 'incident' | 'other'
export type EmployeeRole = 'agent' | 'senior_agent' | 'admin'

export interface Employee {
  id: number
  name: string
  email: string
  avatar: string
  role: EmployeeRole
  department: string
  online: boolean
  activeTickets: number
  resolvedToday: number
  phone?: string
}

export interface TicketMessage {
  id: number
  ticketId: number
  senderId: number
  senderName: string
  senderAvatar: string
  text: string
  attachments: string[]
  createdAt: string
  isInternal: boolean
}

export interface Ticket {
  id: number
  title: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  category: TicketCategory
  createdBy: {
    id: number
    name: string
    email: string
    avatar: string
  }
  assignedTo?: Employee
  messages: TicketMessage[]
  createdAt: string
  updatedAt: string
  tags: string[]
  computerName?: string
  userAccount?: string
}

export interface TicketStats {
  total: number
  open: number
  inProgress: number
  resolved: number
  critical: number
  avgResolutionTime: number
}

export interface CalendarEvent {
  id: number
  title: string
  date: string
  time: string | null
  description: string | null
  creatorId: number
  createdAt: string
}

export interface PollOption {
  id: number
  pollId: number
  text: string
  votesCount: number
  voted?: boolean
}

export interface Poll {
  id: number
  title: string
  description: string
  multipleChoice: boolean
  options: PollOption[]
  totalVotes: number
  myVotes: number[]
  createdBy: number
  createdAt: string
}

export interface FileItem {
  id: number
  name: string
  size: string
  type: string
  folderId: number
  path?: string
  folder?: string
  createdAt: string
}

export interface FileFolder {
  id: number
  name: string
  files: FileItem[]
}

export type ChatType = 'group' | 'personal' | 'channel'

export interface ChatRoom {
  id: number
  name: string
  type: ChatType
  avatar?: string
  lastMessage?: string
  lastTime?: string
  unread: number
  members?: number
}

export interface ChatMessage {
  id: number
  chatId: number
  senderId: number
  senderName: string
  text: string
  image?: string
  createdAt: string
  edited?: boolean
  reactions?: Record<string, number[]>
}

export interface EmployeeProfile {
  id: number
  name: string
  email: string
  phone: string
  role: string
  department: string
  title: string
  avatar: string
  bio: string
  online: boolean
}

export interface WikiArticle {
  id: number
  title: string
  content: string
  category: string
  tags: string[]
  authorId: number
  authorName: string
  createdAt: string
  updatedAt: string
}

export interface NewsPost {
  id: number
  title: string
  content: string
  important: boolean
  authorId: number
  authorName: string
  createdAt: string
}
