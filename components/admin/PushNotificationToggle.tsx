'use client'

import { useEffect, useState } from 'react'
import { subscribeToPush, unsubscribeFromPush } from '@/lib/actions/push-subscriptions'
import { C } from '@/lib/admin-theme'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

type Support = 'checking' | 'unsupported' | 'ios-not-installed' | 'ready'

export function PushNotificationToggle() {
  const [support, setSupport] = useState<Support>('checking')
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true

      if (isIOS && !isStandalone) {
        setSupport('ios-not-installed')
        return
      }
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setSupport('unsupported')
        return
      }

      const registration = await navigator.serviceWorker.register('/sw.js')
      const existing = await registration.pushManager.getSubscription()
      setEnabled(!!existing)
      setSupport('ready')
    }
    init().catch(() => setSupport('unsupported'))
  }, [])

  async function handleToggle() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const registration = await navigator.serviceWorker.ready

      if (enabled) {
        const existing = await registration.pushManager.getSubscription()
        if (existing) {
          await unsubscribeFromPush(existing.endpoint)
          await existing.unsubscribe()
        }
        setEnabled(false)
        return
      }

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setError('Du må godkjenne varsler i nettleseren for å skru dette på')
        return
      }

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!publicKey) {
        setError('Push er ikke konfigurert ennå')
        return
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })
      const json = subscription.toJSON()
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setError('Kunne ikke opprette abonnement')
        return
      }

      const res = await subscribeToPush(
        { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
        navigator.userAgent
      )
      if (!res.ok) {
        setError('Kunne ikke lagre abonnement')
        return
      }
      setEnabled(true)
    } catch {
      setError('Noe gikk galt — prøv igjen')
    } finally {
      setBusy(false)
    }
  }

  if (support === 'checking') return null

  if (support === 'ios-not-installed') {
    return (
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, maxWidth: 260, margin: 0 }}>
        For push-varsler på iPhone: trykk Del-ikonet i Safari → &quot;Legg til på Hjemskjerm&quot; → åpne appen derfra og skru på varsler.
      </p>
    )
  }

  if (support === 'unsupported') {
    return (
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, margin: 0 }}>
        Push-varsler støttes ikke i denne nettleseren.
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={handleToggle}
        disabled={busy}
        aria-pressed={enabled}
        style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: '0.72rem',
          fontWeight: 600,
          color: enabled ? C.accent : C.text3,
          background: enabled ? C.accentBg : 'none',
          border: `1px solid ${enabled ? C.accent : C.border}`,
          borderRadius: 6,
          padding: '6px 12px',
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? 'Vent …' : enabled ? 'Push-varsler på ✓' : 'Skru på push-varsler'}
      </button>
      {error && (
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.danger }}>{error}</span>
      )}
    </div>
  )
}
