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
import FilesPage from "@/pages/Files"
import ChatsPage from "@/pages/Chats"
import ChatDetail from "@/pages/ChatDetail"
import ProfilePage from "@/pages/Profile"
import WikiPage from "@/pages/Wiki"
import SearchPage from "@/pages/Search"
import NewsPage from "@/pages/News"
import KanbanPage from "@/pages/Kanban"
import Login from "@/pages/Login"
import Register from "@/pages/Register"
import Admin from "@/pages/Admin"
import AdminUsers from "@/pages/AdminUsers"
import AdminPush from "@/pages/AdminPush"
import AdminSettings from "@/pages/AdminSettings"
import AdminAudit from "@/pages/AdminAudit"
import NotFound from "@/pages/NotFound"
import ProtectedRoute from "@/components/ProtectedRoute"

export default function App() {
  return (
    <TooltipProvider>
      <AuthProvider>
      <SocketProvider>
      <TicketProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/login" element={<Login />} />
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
                  <Route path="/kanban" element={<KanbanPage />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
                </ProtectedRoute>
              </AppLayout>
            } />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </TicketProvider>
      </SocketProvider>
      </AuthProvider>
    </TooltipProvider>
  )
}
