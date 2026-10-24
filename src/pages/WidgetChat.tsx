import { useParams } from 'react-router-dom'
import WidgetPanel from '@/components/widget/WidgetPanel'

export default function WidgetChat() {
  const { token = '' } = useParams<{ token: string }>()

  const close = () => {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'sd-widget:close' }, '*')
    }
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-white">
      <WidgetPanel websiteToken={token} onClose={close} />
    </div>
  )
}
