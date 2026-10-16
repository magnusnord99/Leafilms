'use client'

import { useState } from 'react'
import { C } from '@/lib/admin-theme'
import { TransferAppearanceEditor } from '@/components/transfers/TransferAppearanceEditor'

type Props = {
  transferId: string
  customerId: string | null
  backgroundImagePath: string | null
  downloadUrl: string | null
}

const linkStyle: React.CSSProperties = {
  fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem',
  color: C.accent, textDecoration: 'none',
  padding: '4px 10px', border: `1px solid rgba(124,92,252,0.3)`,
  borderRadius: 6, background: C.accentBg, whiteSpace: 'nowrap', cursor: 'pointer',
}

export function TransferRowActions({ transferId, customerId, backgroundImagePath, downloadUrl }: Props) {
  const [editing, setEditing] = useState(false)

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {downloadUrl && (
        <a href={downloadUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>
          Åpne lenke
        </a>
      )}
      <button onClick={() => setEditing(true)} style={{ ...linkStyle, border: `1px solid ${C.border}`, color: C.text2, background: 'none' }}>
        Rediger utseende
      </button>
      {editing && (
        <TransferAppearanceEditor
          transferId={transferId}
          customerId={customerId}
          backgroundImagePath={backgroundImagePath}
          onClose={() => setEditing(false)}
          onBackgroundChanged={() => {}}
        />
      )}
    </div>
  )
}
