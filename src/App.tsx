import { lazy, Suspense } from "react"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import { Toaster } from "sonner"
import { AppLayout } from "@/components/layout/app-layout"
import { AdminLayout } from "@/components/layout/admin-layout"
import { TicketProvider } from "@/context/ticket-context"
import { AuthProvider } from "@/context/AuthContext"
import { SocketProvider } from "@/context/SocketContext"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./i18n/index"
import Dashboard from "@/pages/Dashboard"
import Tickets from "@/pages/Tickets"
import TicketDetail from "@/pages/TicketDetail"
import Employees from "@/pages/Employees"
import NewTicket from "@/pages/NewTicket"
import CalendarPage from "@/pages/Calendar"
import PollsPage from "@/pages/Polls"
import ChatsPage from "@/pages/Chats"
import ChatDetail from "@/pages/ChatDetail"
import ProfilePage from "@/pages/Profile"
import NewsPage from "@/pages/News"
import CalculatorPage from "@/pages/Calculator"
import KanbanPage from "@/pages/Kanban"
import NotificationsPage from "@/pages/NotificationsPage"
import Login from "@/pages/Login"
import ForgotPassword from "@/pages/ForgotPassword"
import ResetPassword from "@/pages/ResetPassword"
import Register from "@/pages/Register"
import NotFound from "@/pages/NotFound"

const Admin = lazy(() => import("@/pages/Admin"))
const AdminUsers = lazy(() => import("@/pages/AdminUsers"))
const AdminPush = lazy(() => import("@/pages/AdminPush"))
const AdminSettings = lazy(() => import("@/pages/AdminSettings"))
const AdminAudit = lazy(() => import("@/pages/AdminAudit"))
const WikiPage = lazy(() => import("@/pages/Wiki"))
const SearchPage = lazy(() => import("@/pages/Search"))
const FilesPage = lazy(() => import("@/pages/Files"))
import ProtectedRoute from "@/components/ProtectedRoute"

export default function App() {
  return (
    <TooltipProvider>
      <AuthProvider>
      <SocketProvider>
      <TicketProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Suspense fallback={<div className="flex items-center justify-center h-screen text-muted-foreground text-sm">Загрузка…</div>}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/register" element={<ProtectedRoute adminOnly><Register /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute adminOnly><AdminLayout><Admin /></AdminLayout></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute adminOnly><AdminLayout><AdminUsers /></AdminLayout></ProtectedRoute>} />
            <Route path="/admin/push" element={<ProtectedRoute adminOnly><AdminLayout><AdminPush /></AdminLayout></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute adminOnly><AdminLayout><AdminSettings /></AdminLayout></ProtectedRoute>} />
            <Route path="/admin/audit" element={<ProtectedRoute adminOnly><AdminLayout><AdminAudit /></AdminLayout></ProtectedRoute>} />
            <Route path="/*" element={
              <AppLayout>
                <ProtectedRoute>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/tickets" element={<Tickets />} />
                  <Route path="/tickets/new" element={<NewTicket />} />
                  <Route path="/tickets/:id" element={<TicketDetail />} />
                  <Route path="/employees" element={<Employees />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/polls" element={<PollsPage />} />
                  <Route path="/files" element={<FilesPage />} />
                  <Route path="/chats" element={<ChatsPage />} />
                  <Route path="/chats/:id" element={<ChatDetail />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/wiki" element={<WikiPage />} />
                  <Route path="/news" element={<NewsPage />} />
                  <Route path="/notifications" element={<NotificationsPage />} />
                  <Route path="/calculator" element={<CalculatorPage />} />
                  <Route path="/kanban" element={<KanbanPage />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
                </ProtectedRoute>
              </AppLayout>
            } />
          </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </TicketProvider>
      </SocketProvider>
      </AuthProvider>
    </TooltipProvider>
  )
}
