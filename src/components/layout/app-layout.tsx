import { useEffect, useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { LayoutDashboard, Ticket, MessageCircle, Users, Menu, MoreHorizontal, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Sidebar, SidebarContent } from "./sidebar"
import { PwaInstallPrompt } from "@/components/pwa-install-prompt"
import { cn } from "@/lib/utils"
import NotificationBell from "@/components/NotificationBell"
import LanguageSwitcher from "@/components/LanguageSwitcher"
import { useAuth } from "@/context/AuthContext"

const bottomNavItems = [
  { to: "/", icon: LayoutDashboard, label: "Дашборд" },
  { to: "/tickets", icon: Ticket, label: "Тикеты" },
  { to: "/chats", icon: MessageCircle, label: "Чаты" },
  { to: "/employees", icon: Users, label: "Сотрудники" },
]

export function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault()
        navigate("/search")
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [navigate])

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <MobileHeader onMenuClick={() => setMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 pb-20 md:pb-6 lg:pb-8">
          {children}
        </main>
        <MobileBottomNav onMenuClick={() => setMenuOpen(true)} />
      </div>
      <PwaInstallPrompt />
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="p-0 w-60 flex flex-col bg-sidebar text-sidebar-foreground">
          <SidebarContent onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  )
}

function MobileHeader({ onMenuClick }: { onMenuClick: () => void }) {
  const { logout } = useAuth()
  return (
    <div className="flex items-center justify-between p-4 border-b bg-background md:pl-6">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-primary flex items-center justify-center md:hidden">
          <span className="text-white text-[10px] font-bold">SD</span>
        </div>
        <span className="font-bold text-sm">Service Desk</span>
      </div>
      <div className="flex items-center gap-1">
        <NotificationBell />
        <span className="md:hidden"><LanguageSwitcher /></span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => { logout(); window.location.href = '/login' }}
          className="text-muted-foreground hover:text-destructive"
          title="Выйти" aria-label="Выйти"
        >
          <LogOut className="w-5 h-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onMenuClick} className="md:hidden" aria-label="Меню">
          <Menu className="w-5 h-5" />
        </Button>
      </div>
    </div>
  )
}

function MobileBottomNav({ onMenuClick }: { onMenuClick: () => void }) {
  const nav = useNavigate()
  const { logout } = useAuth()
  const location = useLocation()

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/"
    return location.pathname.startsWith(path)
  }

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background border-t flex items-center justify-around py-1">
      {bottomNavItems.map((item) => (
        <button
          key={item.to}
          onClick={() => nav(item.to)}
          className={cn(
            "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors min-w-0 flex-1",
            isActive(item.to)
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <item.icon className="w-5 h-5" />
          <span className="text-[10px] font-medium leading-tight">{item.label}</span>
        </button>
      ))}
      <button
        onClick={() => { logout(); window.location.href = '/login' }}
        className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors min-w-0 flex-1 text-muted-foreground hover:text-destructive"
      >
        <LogOut className="w-5 h-5" />
        <span className="text-[10px] font-medium leading-tight">Выйти</span>
      </button>
      <button
        onClick={onMenuClick}
        className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors min-w-0 flex-1 text-muted-foreground hover:text-foreground"
      >
        <MoreHorizontal className="w-5 h-5" />
        <span className="text-[10px] font-medium leading-tight">Меню</span>
      </button>
    </nav>
  )
}
