import { useEffect, useState } from "react"
import { Download, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem("pwa-dismissed") === "true")

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener("beforeinstallprompt", handler)
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  if (!deferredPrompt || dismissed) return null

  const handleInstall = async () => {
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === "accepted") setDeferredPrompt(null)
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setDismissed(true)
    localStorage.setItem("pwa-dismissed", "true")
  }

  return (
    <div className={cn(
      "fixed bottom-20 left-2 right-2 z-50 md:bottom-4 md:left-auto md:right-4 md:w-80",
      "flex items-center gap-3 rounded-lg border bg-background p-3 shadow-lg"
    )}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary">
        <Download className="h-4 w-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight">Установите приложение</p>
        <p className="text-xs text-muted-foreground">Service Desk на вашем устройстве</p>
      </div>
      <Button size="sm" onClick={handleInstall} className="shrink-0">
        Установить
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleDismiss} aria-label="Закрыть">
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
