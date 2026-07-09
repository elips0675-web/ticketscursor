import { Navigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
import type { ReactNode } from "react"

export default function ProtectedRoute({ children, adminOnly }: { children: ReactNode; adminOnly?: boolean }) {
  const { token, user } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  if (adminOnly && user?.role !== "admin" && user?.role !== "super_admin") return <Navigate to="/" replace />
  return <>{children}</>
}
