import { toast } from 'sonner'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'

function getToken(): string | null {
  return localStorage.getItem('token')
}

async function handleResponse(res: Response): Promise<any> {
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.href = '/login'
    throw new Error('Сессия истекла')
  }
  if (res.status === 204) return null
  const payload = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(payload?.message || `Ошибка ${res.status}`)
  }
  if (payload && typeof payload === 'object' && typeof payload.success === 'boolean') {
    if (Object.prototype.hasOwnProperty.call(payload, 'data')) return payload.data
    return payload
  }
  return payload
}

async function request(method: string, path: string, body?: any, opts?: RequestInit): Promise<any> {
  const token = getToken()
  const headers: Record<string, string> = { ...(opts?.headers as Record<string, string>) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      ...opts,
    })
    return await handleResponse(res)
  } catch (err: any) {
    if (err?.message === 'Сессия истекла') throw err
    toast.error(err?.message || 'Ошибка сети')
    throw err
  }
}

export const api = {
  get: (path: string, opts?: RequestInit) => request('GET', path, undefined, opts),
  post: (path: string, body?: any, opts?: RequestInit) => request('POST', path, body, opts),
  put: (path: string, body?: any, opts?: RequestInit) => request('PUT', path, body, opts),
  delete: (path: string, opts?: RequestInit) => request('DELETE', path, undefined, opts),
}
