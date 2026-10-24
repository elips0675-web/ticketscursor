import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageCircle, X } from 'lucide-react'
import WidgetPanel from '@/components/widget/WidgetPanel'
import { fetchDefaultWidgetChannel, type WidgetDefaultChannel } from '@/lib/widget-api'
import { cn } from '@/lib/utils'

export default function WidgetLauncher() {
  const { t } = useTranslation()
  const [channel, setChannel] = useState<WidgetDefaultChannel | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let active = true
    fetchDefaultWidgetChannel()
      .then((data) => {
        if (active) setChannel(data)
      })
      .catch(() => {
        if (active) setUnavailable(true)
      })
    return () => {
      active = false
    }
  }, [])

  if (unavailable || !channel) return null

  const accent = channel.color || '#1f93ff'

  return (
    <>
      {open && (
        <div className="fixed bottom-[104px] right-5 z-[2147483000] h-[calc(100%-140px)] max-h-[640px] min-h-[250px] w-[400px] overflow-hidden rounded-2xl bg-white shadow-[0_5px_40px_rgba(0,0,0,0.16)] max-sm:inset-0 max-sm:h-full max-sm:max-h-none max-sm:w-full max-sm:rounded-none">
          <WidgetPanel websiteToken={channel.token} onClose={() => setOpen(false)} />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-label={open ? t('widget.close') : t('widget.open')}
        aria-expanded={open}
        className={cn(
          'fixed bottom-5 right-5 z-[2147483000] flex h-16 w-16 items-center justify-center rounded-full text-white shadow-[0_8px_24px_rgba(0,0,0,0.16)] transition-transform hover:scale-105',
          open && 'max-sm:hidden',
        )}
        style={{ backgroundColor: accent }}
      >
        {open ? <X className="h-7 w-7" /> : <MessageCircle className="h-7 w-7" />}
      </button>
    </>
  )
}
