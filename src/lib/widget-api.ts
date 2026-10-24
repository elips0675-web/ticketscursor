const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

export interface WidgetChannelConfig {
  name: string
  welcome: string
  offline: string
  color: string
}

export interface WidgetDefaultChannel {
  token: string
  name: string
  color: string
}

export interface WidgetConversation {
  token: string
  name: string
  status: 'open' | 'closed'
  created_at: string
}

export interface WidgetMessage {
  id: number
  sender_type: 'visitor' | 'agent'
  sender_name: string
  text: string
  created_at: string
}

export interface WidgetThread {
  name: string
  status: 'open' | 'closed'
  messages: WidgetMessage[]
}

export class WidgetApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'WidgetApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}/widget${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  const payload = (await response.json().catch(() => null)) as {
    success?: boolean
    data?: T
    message?: string
  } | null

  if (!response.ok || !payload?.success) {
    throw new WidgetApiError(response.status, payload?.message || `HTTP ${response.status}`)
  }

  return payload.data as T
}

export function fetchDefaultWidgetChannel(): Promise<WidgetDefaultChannel> {
  return request<WidgetDefaultChannel>('/default')
}

export function fetchWidgetConfig(websiteToken: string): Promise<WidgetChannelConfig> {
  return request<WidgetChannelConfig>(`/${encodeURIComponent(websiteToken)}/config`)
}

export function createWidgetConversation(
  websiteToken: string,
  payload: { visitor_id: string; name: string; email?: string },
): Promise<WidgetConversation> {
  return request<WidgetConversation>(`/${encodeURIComponent(websiteToken)}/conversations`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function fetchWidgetThread(
  websiteToken: string,
  conversationToken: string,
  after = 0,
): Promise<WidgetThread> {
  const query = after > 0 ? `?after=${after}` : ''
  return request<WidgetThread>(
    `/${encodeURIComponent(websiteToken)}/conversations/${encodeURIComponent(conversationToken)}${query}`,
  )
}

export function sendWidgetMessage(
  websiteToken: string,
  conversationToken: string,
  text: string,
): Promise<WidgetMessage> {
  return request<WidgetMessage>(
    `/${encodeURIComponent(websiteToken)}/conversations/${encodeURIComponent(conversationToken)}/messages`,
    { method: 'POST', body: JSON.stringify({ text }) },
  )
}
