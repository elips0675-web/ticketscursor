import * as Sentry from '@sentry/react'
import { lazy, Suspense, useState, ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { CommandPalette } from '@/components/CommandPalette'
import { AppLayout } from '@/components/layout/app-layout'
import { AdminLayout } from '@/components/layout/admin-layout'
import { TicketProvider } from '@/context/ticket-context'
import { AuthProvider } from '@/context/AuthContext'
import { SocketProvider } from '@/context/SocketContext'
import { TooltipProvider } from '@/components/ui/tooltip'
import ErrorBoundary from '@/components/ErrorBoundary'
import ProtectedRoute from '@/components/ProtectedRoute'
import './i18n/index'
import Dashboard from '@/pages/Dashboard'
import Tickets from '@/pages/Tickets'
import TicketDetail from '@/pages/TicketDetail'
import Employees from '@/pages/Employees'
import NewTicket from '@/pages/NewTicket'
import CalendarPage from '@/pages/Calendar'
import PollsPage from '@/pages/Polls'
import ChatsPage from '@/pages/Chats'
import ChatDetail from '@/pages/ChatDetail'
import ProfilePage from '@/pages/Profile'
import NewsPage from '@/pages/News'
import CalculatorPage from '@/pages/Calculator'
import KanbanPage from '@/pages/Kanban'
import NotificationsPage from '@/pages/NotificationsPage'
import Login from '@/pages/Login'
import ForgotPassword from '@/pages/ForgotPassword'
import ResetPassword from '@/pages/ResetPassword'
import { SSOLogin, SSOCallback } from '@/pages/SSO'
import Register from '@/pages/Register'
import NotFound from '@/pages/NotFound'

const Admin = lazy(() => import('@/pages/Admin'))
const AdminUsers = lazy(() => import('@/pages/AdminUsers'))
const AdminPush = lazy(() => import('@/pages/AdminPush'))
const AdminSettings = lazy(() => import('@/pages/AdminSettings'))
const AdminAudit = lazy(() => import('@/pages/AdminAudit'))
const AdminCannedResponses = lazy(() => import('@/pages/AdminCannedResponses'))
const AdminCustomFields = lazy(() => import('@/pages/AdminCustomFields'))
const WikiPage = lazy(() => import('@/pages/Wiki'))
const SearchPage = lazy(() => import('@/pages/Search'))
const FilesPage = lazy(() => import('@/pages/Files'))
const CsatisfactionPage = lazy(() => import('@/pages/Csatisfaction'))

function Page({ children }: { children: ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>
}

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    tracesSampleRate: parseFloat(import.meta.env.VITE_SENTRY_SAMPLE_RATE || '0.1'),
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  })
}

const SentryRoutes =
  typeof Sentry.withSentryReactRouterV6Routing === 'function' ? Sentry.withSentryReactRouterV6Routing(Routes) : Routes

export default function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <SocketProvider>
            <TicketProvider>
              <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center h-screen text-muted-foreground text-sm">
                      Загрузка…
                    </div>
                  }
                >
                  <Toaster position="top-right" richColors closeButton />
                  <CommandPalette />
                  <SentryRoutes>
                    <Route
                      path="/login"
                      element={
                        <Page>
                          <Login />
                        </Page>
                      }
                    />
                    <Route
                      path="/forgot-password"
                      element={
                        <Page>
                          <ForgotPassword />
                        </Page>
                      }
                    />
                    <Route
                      path="/reset-password"
                      element={
                        <Page>
                          <ResetPassword />
                        </Page>
                      }
                    />
                    <Route
                      path="/register"
                      element={
                        <ProtectedRoute adminOnly>
                          <Page>
                            <Register />
                          </Page>
                        </ProtectedRoute>
                      }
                    />

                    <Route path="/auth/sso" element={<SSOLogin />} />
                    <Route path="/auth/sso/callback" element={<SSOCallback />} />

                    <Route
                      path="/admin"
                      element={
                        <ProtectedRoute adminOnly>
                          <Page>
                            <AdminLayout />
                          </Page>
                        </ProtectedRoute>
                      }
                    >
                      <Route
                        index
                        element={
                          <Page>
                            <Admin />
                          </Page>
                        }
                      />
                      <Route
                        path="users"
                        element={
                          <Page>
                            <AdminUsers />
                          </Page>
                        }
                      />
                      <Route
                        path="push"
                        element={
                          <Page>
                            <AdminPush />
                          </Page>
                        }
                      />
                      <Route
                        path="settings"
                        element={
                          <Page>
                            <AdminSettings />
                          </Page>
                        }
                      />
                      <Route
                        path="audit"
                        element={
                          <Page>
                            <AdminAudit />
                          </Page>
                        }
                      />
                      <Route
                        path="canned-responses"
                        element={
                          <Page>
                            <AdminCannedResponses />
                          </Page>
                        }
                      />
                      <Route
                        path="custom-fields"
                        element={
                          <Page>
                            <AdminCustomFields />
                          </Page>
                        }
                      />
                    </Route>

                    <Route element={<AppLayout />}>
                      <Route
                        index
                        element={
                          <Page>
                            <Dashboard />
                          </Page>
                        }
                      />
                      <Route
                        path="tickets"
                        element={
                          <Page>
                            <Tickets />
                          </Page>
                        }
                      />
                      <Route
                        path="tickets/new"
                        element={
                          <Page>
                            <NewTicket />
                          </Page>
                        }
                      />
                      <Route
                        path="tickets/:id"
                        element={
                          <Page>
                            <TicketDetail />
                          </Page>
                        }
                      />
                      <Route
                        path="employees"
                        element={
                          <Page>
                            <Employees />
                          </Page>
                        }
                      />
                      <Route
                        path="calendar"
                        element={
                          <Page>
                            <CalendarPage />
                          </Page>
                        }
                      />
                      <Route
                        path="polls"
                        element={
                          <Page>
                            <PollsPage />
                          </Page>
                        }
                      />
                      <Route
                        path="chats"
                        element={
                          <Page>
                            <ChatsPage />
                          </Page>
                        }
                      />
                      <Route
                        path="chats/:id"
                        element={
                          <Page>
                            <ChatDetail />
                          </Page>
                        }
                      />
                      <Route
                        path="profile"
                        element={
                          <Page>
                            <ProfilePage />
                          </Page>
                        }
                      />
                      <Route
                        path="news"
                        element={
                          <Page>
                            <NewsPage />
                          </Page>
                        }
                      />
                      <Route
                        path="notifications"
                        element={
                          <Page>
                            <NotificationsPage />
                          </Page>
                        }
                      />
                      <Route
                        path="calculator"
                        element={
                          <Page>
                            <CalculatorPage />
                          </Page>
                        }
                      />
                      <Route
                        path="kanban"
                        element={
                          <Page>
                            <KanbanPage />
                          </Page>
                        }
                      />
                      <Route
                        path="wiki"
                        element={
                          <Page>
                            <WikiPage />
                          </Page>
                        }
                      />
                      <Route
                        path="files"
                        element={
                          <Page>
                            <FilesPage />
                          </Page>
                        }
                      />
                      <Route
                        path="search"
                        element={
                          <Page>
                            <SearchPage />
                          </Page>
                        }
                      />
                      <Route
                        path="/csat/:token"
                        element={
                          <Page>
                            <CsatisfactionPage />
                          </Page>
                        }
                      />
                      <Route
                        path="*"
                        element={
                          <Page>
                            <NotFound />
                          </Page>
                        }
                      />
                    </Route>
                  </SentryRoutes>
                </Suspense>
              </BrowserRouter>
            </TicketProvider>
          </SocketProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}
