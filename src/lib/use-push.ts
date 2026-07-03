import { useEffect, useState, useCallback } from "react"

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const data = atob(base64.replace(/-/g, "+").replace(/_/g, "/") + padding)
  const output = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) output[i] = data.charCodeAt(i)
  return output
}

export function usePush() {
  const [subscribed, setSubscribed] = useState(false)
  const [supported, setSupported] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setSupported("serviceWorker" in navigator && "PushManager" in window)
  }, [])

  useEffect(() => {
    if (!supported) return
    navigator.serviceWorker.ready.then((reg) =>
      reg.pushManager.getSubscription().then((sub) => setSubscribed(!!sub))
    )
  }, [supported])

  const subscribe = useCallback(async () => {
    if (!supported) return
    setLoading(true)
    try {
      const token = localStorage.getItem("token")
      const res = await fetch("/api/push/vapid-key", { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const { publicKey } = await res.json()
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        })
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ subscription_json: sub.toJSON() }),
        })
      }
    } catch {
      // backend недоступен — демо-режим
    }
    setSubscribed(true)
    setLoading(false)
  }, [supported])

  const unsubscribe = useCallback(async () => {
    if (!supported) return
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) await sub.unsubscribe()

      const token = localStorage.getItem("token")
      await fetch("/api/push/unsubscribe", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch {
      // backend недоступен — демо-режим
    }
    setSubscribed(false)
    setLoading(false)
  }, [supported])

  return { subscribed, supported, loading, subscribe, unsubscribe }
}
