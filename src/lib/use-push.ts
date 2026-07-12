import { useEffect, useState, useCallback, useRef } from 'react'

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const data = atob(base64.replace(/-/g, '+').replace(/_/g, '/') + padding)
  const output = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) output[i] = data.charCodeAt(i)
  return output
}

export function usePush() {
  const [subscribed, setSubscribed] = useState(false)
  const [supported, setSupported] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isSubscribing = useRef(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported('serviceWorker' in navigator && 'PushManager' in window)
  }, [])

  useEffect(() => {
    if (!supported) return
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription().then((sub) => setSubscribed(!!sub)))
      .catch(() => {})
  }, [supported])

  const subscribe = useCallback(async () => {
    if (!supported || isSubscribing.current) return
    isSubscribing.current = true
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/push/vapid-key', { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error('VAPID key not configured on server')
      const body = await res.json()
      const { publicKey } = body.data || body

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })

      const save = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subscription_json: sub.toJSON() }),
      })
      if (!save.ok) throw new Error('Failed to save subscription')
      setSubscribed(true)
    } catch (e) {
      setSubscribed(false)
      setError(e instanceof Error ? e.message : 'Push subscription failed')
    }
    isSubscribing.current = false
    setLoading(false)
  }, [supported])

  const unsubscribe = useCallback(async () => {
    if (!supported) return
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) await sub.unsubscribe()

      const token = localStorage.getItem('token')
      await fetch('/api/push/unsubscribe', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch {
      // backend недоступен — демо-режим
    }
    setSubscribed(false)
    setLoading(false)
  }, [supported])

  return { subscribed, supported, loading, error, subscribe, unsubscribe }
}
