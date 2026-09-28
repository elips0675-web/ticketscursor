import { NavLink } from 'react-router-dom'
import {
  Search,
  Ticket,
  LayoutDashboard,
  Users,
  PlusCircle,
  Calendar,
  BarChart3,
  FileText,
  MessageCircle,
  User,
  LogOut,
  BookOpen,
  Newspaper,
  Shield,
  Columns3,
  Calculator,
  Network,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useFeature } from '@/hooks/useFeature'

const navItems = [
  {
    to: '/',
    icon: LayoutDashboard,
    labelKey: 'nav.dashboard',
    roles: ['super_admin', 'admin', 'senior_agent', 'agent', 'requester'],
  },
  {
    to: '/search',
    icon: Search,
    labelKey: 'nav.search',
    roles: ['super_admin', 'admin', 'senior_agent', 'agent', 'requester'],
  },

  {
    to: '/chats',
    icon: MessageCircle,
    labelKey: 'nav.chats',
    roles: ['super_admin', 'admin', 'senior_agent', 'agent'],
  },
  {
    to: '/tickets',
    icon: Ticket,
    labelKey: 'nav.tickets',
    roles: ['super_admin', 'admin', 'senior_agent', 'agent', 'requester'],
  },
  { to: '/kanban', icon: Columns3, labelKey: 'nav.kanban', roles: ['super_admin', 'admin', 'senior_agent', 'agent'] },
  {
    to: '/employees',
    icon: Users,
    labelKey: 'nav.employees',
    roles: ['super_admin', 'admin', 'senior_agent', 'agent'],
  },
  {
    to: '/team',
    icon: Network,
    labelKey: 'nav.team',
    roles: ['super_admin', 'admin', 'senior_agent', 'agent'],
    feature: 'org_chart',
  },
  {
    to: '/calendar',
    icon: Calendar,
    labelKey: 'nav.calendar',
    roles: ['super_admin', 'admin', 'senior_agent', 'agent'],
  },
  { to: '/polls', icon: BarChart3, labelKey: 'nav.polls', roles: ['super_admin', 'admin', 'senior_agent', 'agent'] },
  { to: '/wiki', icon: BookOpen, labelKey: 'nav.wiki', roles: ['super_admin', 'admin', 'senior_agent', 'agent'] },
  { to: '/news', icon: Newspaper, labelKey: 'nav.news', roles: ['super_admin', 'admin', 'senior_agent', 'agent'] },
  {
    to: '/calculator',
    icon: Calculator,
    labelKey: 'nav.calculator',
    roles: ['super_admin', 'admin', 'senior_agent', 'agent', 'requester'],
  },
  { to: '/files', icon: FileText, labelKey: 'nav.files', roles: ['super_admin', 'admin', 'senior_agent', 'agent'] },
  {
    to: '/tickets/new',
    icon: PlusCircle,
    labelKey: 'tickets.new',
    roles: ['super_admin', 'admin', 'senior_agent', 'agent', 'requester'],
  },
]

const bottomItems = [
  { to: '/admin', icon: Shield, labelKey: 'nav.admin', roles: ['super_admin', 'admin'] },
  {
    to: '/profile',
    icon: User,
    labelKey: 'nav.profile',
    roles: ['super_admin', 'admin', 'senior_agent', 'agent', 'requester'],
  },
]

export function Sidebar() {
  return (
    <aside className="hidden md:flex md:w-60 flex-col bg-sidebar text-sidebar-foreground h-screen shrink-0 overflow-y-auto">
      <SidebarContent />
    </aside>
  )
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  const userRole = user?.role || 'agent'
  const orgChartOn = useFeature('org_chart')

  const filterByRole = (items: typeof navItems) =>
    items.filter((i) => i.roles.includes(userRole) && (!('feature' in i) || (i.feature === 'org_chart' && orgChartOn)))
  return (
    <>
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <Ticket className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-sm leading-tight">Service Desk</h1>
            <p className="text-[9px] text-sidebar-foreground/50 font-bold uppercase tracking-widest mt-0.5">Helpdesk</p>
          </div>
        </div>
      </div>

      <nav aria-label="Боковая навигация" className="flex-1 p-3 space-y-1">
        {filterByRole(navItems).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-primary'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground',
              )
            }
          >
            <item.icon className="w-4 h-4" />
            {t(item.labelKey)}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-sidebar-border space-y-1">
        {filterByRole(bottomItems).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-primary'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground',
              )
            }
          >
            <item.icon className="w-4 h-4" />
            {t(item.labelKey)}
          </NavLink>
        ))}
        <button
          onClick={() => {
            logout()
            window.location.href = '/login'
          }}
          className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold transition-colors text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <LogOut className="w-4 h-4" />
          {t('auth.logout')}
        </button>
        <LanguageSwitcher />
        {user && (
          <div className="px-3 py-2 mt-2 text-[10px] text-sidebar-foreground/40 uppercase tracking-widest font-bold">
            {user.role === 'super_admin'
              ? 'Super Admin'
              : user.role === 'admin'
                ? t('admin.title')
                : user.role === 'senior_agent'
                  ? 'Senior Agent'
                  : t('auth.role')}
          </div>
        )}
      </div>
    </>
  )
}
