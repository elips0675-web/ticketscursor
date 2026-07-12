import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import type { ReactNode } from 'react'

export default function ProtectedRoute({ children, adminOnly }: { children: ReactNode; adminOnly?: boolean }) {
  const { token, user, loading } = useAuth()
  if (loading)
    return <div className="flex items-center justify-center h-screen text-muted-foreground text-sm">Загрузка…</div>
  if (!token) return <Navigate to="/login" replace />
  if (adminOnly && user?.role !== 'admin' && user?.role !== 'super_admin') return <Navigate to="/" replace />
  return <>{children}</>
}
