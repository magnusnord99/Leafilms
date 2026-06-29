'use client'

import { useState } from 'react'
import { C } from '@/lib/admin-theme'
import { AIChatPanel } from './AIChatPanel'

export function AIChatButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {open && <AIChatPanel onClose={() => setOpen(false)} />}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Spør AI om prosjekter, leads og kunder"
        style={{
          position: 'fixed',
          bottom: 20,
          right: 68,
          zIndex: 90,
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: `1px solid ${open ? C.accent : 'transparent'}`,
          background: open ? C.accentBg : C.surface,
          boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
          color: open ? C.accent : C.text3,
          fontSize: '0.95rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.15s, background 0.15s, border-color 0.15s, transform 0.15s',
        }}
        onMouseEnter={(e) => {
          if (!open) {
            ;(e.currentTarget as HTMLButtonElement).style.color = C.text
            ;(e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)'
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            ;(e.currentTarget as HTMLButtonElement).style.color = C.text3
            ;(e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'
          }
        }}
      >
        ✦
      </button>
    </>
  )
}
