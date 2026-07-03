import { NavLink } from "react-router-dom"
import { Search, Ticket, LayoutDashboard, Users, PlusCircle, Calendar, BarChart3, FileText, MessageCircle, User, HelpCircle, LogOut, BookOpen, Newspaper, Shield, Columns3, Sun, Moon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/context/AuthContext"
import { useTheme } from "@/context/ThemeContext"

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Дашборд", roles: ["admin", "senior_agent", "agent"] },
  { to: "/search", icon: Search, label: "Поиск", roles: ["admin", "senior_agent", "agent"] },
  { to: "/chats", icon: MessageCircle, label: "Чаты", roles: ["admin", "senior_agent", "agent"] },
  { to: "/tickets", icon: Ticket, label: "Тикеты", roles: ["admin", "senior_agent", "agent"] },
  { to: "/kanban", icon: Columns3, label: "Канбан", roles: ["admin", "senior_agent", "agent"] },
  { to: "/employees", icon: Users, label: "Сотрудники", roles: ["admin", "senior_agent", "agent"] },
  { to: "/calendar", icon: Calendar, label: "Календарь", roles: ["admin", "senior_agent", "agent"] },
  { to: "/polls", icon: BarChart3, label: "Опросы", roles: ["admin", "senior_agent", "agent"] },
  { to: "/wiki", icon: BookOpen, label: "База знаний", roles: ["admin", "senior_agent", "agent"] },
  { to: "/news", icon: Newspaper, label: "Новости", roles: ["admin", "senior_agent", "agent"] },
  { to: "/files", icon: FileText, label: "Файлы", roles: ["admin", "senior_agent", "agent"] },
  { to: "/tickets/new", icon: PlusCircle, label: "Новый тикет", roles: ["admin", "senior_agent", "agent"] },
]

const bottomItems = [
  { to: "/admin", icon: Shield, label: "Администрирование", roles: ["admin"] },
  { to: "/profile", icon: User, label: "Профиль", roles: ["admin", "senior_agent", "agent"] },
]

export function Sidebar() {
  return (
    <aside className="hidden md:flex md:w-60 flex-col bg-sidebar text-sidebar-foreground h-screen shrink-0">
      <SidebarContent />
    </aside>
  )
}

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold transition-colors text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
    >
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      {theme === "dark" ? "Светлая тема" : "Тёмная тема"}
    </button>
  )
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth()
  const userRole = user?.role || "agent"

  const filterByRole = (items: typeof navItems) => items.filter(i => i.roles.includes(userRole))
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

      <nav className="flex-1 p-3 space-y-1">
        {filterByRole(navItems).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )
            }
          >
            <item.icon className="w-4 h-4" />
            {item.label}
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
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )
            }
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </NavLink>
        ))}
        <ThemeToggle />
        <button
          onClick={() => { logout(); window.location.href = '/login' }}
          className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold transition-colors text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <LogOut className="w-4 h-4" />
          Выйти
        </button>
        {user && (
          <div className="px-3 py-2 mt-2 text-[10px] text-sidebar-foreground/40 uppercase tracking-widest font-bold">
            {user.role === "admin" ? "Администратор" : user.role === "senior_agent" ? "Старший агент" : "Агент"}
          </div>
        )}
      </div>
    </>
  )
}
