'use client'

import { C } from '@/lib/admin-theme'

// admin-theme mangler warning — samme verdi som resten av admin-sidene bruker lokalt
const WARNING = '#F0A500'

export function PastStageBanner({
  currentStageLabel, unlocked, onUnlock,
}: {
  currentStageLabel: string
  unlocked: boolean
  onUnlock: () => void
}) {
  if (unlocked) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
        background: 'rgba(240,165,0,0.1)', border: `1px solid ${WARNING}4D`,
        borderRadius: 6, marginBottom: 16,
      }}>
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600, color: WARNING }}>
          🔓 Redigerer et fullført steg
        </span>
      </div>
    )
  }

  function handleUnlockClick() {
    const ok = confirm(
      `Dette steget er fullført og prosjektet har gått videre til ${currentStageLabel}. Er du sikker på at du vil redigere det? Endringene lagres direkte.`
    )
    if (ok) onUnlock()
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 14px',
      background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, marginBottom: 16,
    }}>
      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2 }}>
        🔒 Skrivebeskyttet · steget er fullført
      </span>
      <button
        onClick={handleUnlockClick}
        style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600,
          padding: '5px 12px', borderRadius: 5, cursor: 'pointer',
          background: 'transparent', color: C.accent, border: '1px solid rgba(124,92,252,0.3)',
        }}
      >
        Lås opp for redigering
      </button>
    </div>
  )
}
