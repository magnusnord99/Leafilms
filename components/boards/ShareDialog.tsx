'use client'

import { useState } from 'react'
import { C } from '@/lib/admin-theme'
import { enableBoardShare, disableBoardShare } from '@/lib/actions/boards'

export default function ShareDialog({ boardId, initialToken, onClose }: {
  boardId: string
  initialToken: string | null
  onClose: () => void
}) {
  const [token, setToken] = useState(initialToken)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const url = token ? `${window.location.origin}/b/${token}` : null

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 420, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, fontFamily: 'var(--font-dm-sans)' }}>
        <h3 style={{ color: C.text, fontSize: '1rem', fontWeight: 700, marginBottom: 6 }}>Del board</h3>
        <p style={{ color: C.text2, fontSize: '0.78rem', marginBottom: 16 }}>
          Alle med lenken kan se boardet og underboards — men ikke redigere.
        </p>
        {url ? (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input readOnly value={url} style={{ flex: 1, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 10px', color: C.text, fontSize: '0.75rem', outline: 'none' }} />
              <button
                onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 7, padding: '8px 14px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
              >{copied ? 'Kopiert ✓' : 'Kopier'}</button>
            </div>
            <button
              disabled={busy}
              onClick={async () => { setBusy(true); if (await disableBoardShare(boardId)) setToken(null); setBusy(false) }}
              style={{ background: 'transparent', color: C.danger, border: `1px solid ${C.danger}55`, borderRadius: 7, padding: '8px 14px', fontSize: '0.75rem', cursor: 'pointer' }}
            >Slå av deling</button>
          </>
        ) : (
          <button
            disabled={busy}
            onClick={async () => { setBusy(true); setToken(await enableBoardShare(boardId)); setBusy(false) }}
            style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 7, padding: '9px 16px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
          >{busy ? 'Genererer …' : 'Lag delingslenke'}</button>
        )}
      </div>
    </div>
  )
}
