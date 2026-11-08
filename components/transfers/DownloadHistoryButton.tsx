'use client'

import { useEffect, useState } from 'react'
import { C } from '@/lib/admin-theme'
import { getTransferDownloadHistory, type TransferDownloadEvent } from '@/lib/actions/transfers'

// Grov enhets-/nettleser-gjenkjenning fra User-Agent — godt nok til å skille
// "mobil vs. desktop" og "Safari vs. Chrome" ved feilsøking av nedlastinger,
// ikke ment som en fullstendig UA-parser.
function describeUserAgent(ua: string | null): string {
  if (!ua) return 'Ukjent enhet'
  const isIOS = /iPhone|iPad|iPod/.test(ua)
  const isAndroid = /Android/.test(ua)
  const isMac = /Macintosh/.test(ua)
  const isWindows = /Windows/.test(ua)
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : isIOS ? 'iOS' : isAndroid ? 'Android' : isMac ? 'Mac' : isWindows ? 'Windows' : 'Ukjent enhet'

  let browser = 'Ukjent nettleser'
  if (/EdgiOS|Edg\//.test(ua)) browser = 'Edge'
  else if (/CriOS|Chrome\//.test(ua)) browser = 'Chrome'
  else if (/FxiOS|Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari'

  return `${device} · ${browser}`
}

export function DownloadHistoryButton({ transferId, downloadCount }: { transferId: string; downloadCount: number }) {
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState<TransferDownloadEvent[] | null>(null)
  const loading = open && events === null

  useEffect(() => {
    if (!open || events !== null) return
    getTransferDownloadHistory(transferId).then(setEvents)
  }, [open, events, transferId])

  if (downloadCount <= 0) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.accent,
          background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline', marginTop: 2,
        }}
      >
        Se detaljer
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 22,
              width: 'min(440px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto',
              display: 'flex', flexDirection: 'column', gap: 14,
            }}
          >
            <div>
              <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.02rem', fontWeight: 600, color: C.text, marginBottom: 2 }}>
                Nedlastinger
              </h2>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
                Hvert forsøk på å laste ned denne leveransen
              </p>
            </div>

            {loading ? (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>Laster...</p>
            ) : events && events.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {events.map(ev => (
                  <div key={ev.id} style={{ padding: '9px 11px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 7 }}>
                    <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, color: C.text }}>
                      {new Date(ev.downloaded_at).toLocaleString('nb-NO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text2, marginTop: 2 }}>
                      {describeUserAgent(ev.user_agent)}
                      {ev.ip_address && <span style={{ color: C.text3 }}> · {ev.ip_address}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>
                Ingen detaljerte nedlastinger registrert ennå — denne leveransen ble lastet ned før den detaljerte loggen ble innført.
              </p>
            )}

            <button
              onClick={() => setOpen(false)}
              style={{
                alignSelf: 'flex-end', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600,
                padding: '8px 16px', borderRadius: 7, cursor: 'pointer',
                background: C.surface2, color: C.text2, border: `1px solid ${C.border}`,
              }}
            >
              Lukk
            </button>
          </div>
        </div>
      )}
    </>
  )
}
