import { createContext, useContext, useState, type ReactNode } from 'react'
import { API_URL } from '@/lib/api'

function getInitialToken(): string | null {
  const t = localStorage.getItem('token')
  if (!t) return null
  const parts = t.split('.')
  if (parts.length !== 3) return t
  try {
    const payload = JSON.parse(atob(parts[1]))
    if (payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      return null
    }
    return t
  } catch {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    return null
  }
}

function getInitialUser(): User | null {
  const u = localStorage.getItem('user')
  if (!u) return null
  try {
    return JSON.parse(u)
  } catch {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    return null
  }
}

interface User {
  id: number
  name: string
  email: string
  role: 'super_admin' | 'admin' | 'senior_agent' | 'agent' | 'requester'
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (token: string, user: User) => void
  logout: () => void
  isAdmin: boolean
  isSenior: boolean
  isSuperAdmin: boolean
  canManage: boolean
}

export const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(getInitialUser)
  const [token, setToken] = useState<string | null>(getInitialToken)

  const login = (t: string, u: User) => {
    localStorage.setItem('token', t)
    localStorage.setItem('user', JSON.stringify(u))
    setToken(t)
    setUser(u)
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setToken(null)
    setUser(null)
    fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {})
  }

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  const isSenior = user?.role === 'senior_agent' || user?.role === 'admin' || user?.role === 'super_admin'
  const isSuperAdmin = user?.role === 'super_admin'
  const canManage = isAdmin || isSenior

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAdmin, isSenior, isSuperAdmin, canManage }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
