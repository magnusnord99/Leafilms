'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { C } from '@/lib/admin-theme'
import { TransferAppearanceEditor } from '@/components/transfers/TransferAppearanceEditor'

type Props = {
  transferId: string
  filename: string
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

// Splitter "Statkraft Høyanger.zip" i ["Statkraft Høyanger", ".zip"] — etternavnet
// beholdes alltid uendret ved renaming, ellers slutter filen å kunne åpnes hos
// mottaker (den faktiske nedlastingen bruker transfers.filename direkte, se
// recordDownload i lib/actions/transfers.ts).
function splitExtension(filename: string): [string, string] {
  const dot = filename.lastIndexOf('.')
  if (dot <= 0) return [filename, '']
  return [filename.slice(0, dot), filename.slice(dot)]
}

export function TransferRowActions({ transferId, filename, customerId, backgroundImagePath, downloadUrl }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [baseName, setBaseName] = useState(() => splitExtension(filename)[0])
  const [saving, setSaving] = useState(false)
  const ext = splitExtension(filename)[1]

  async function handleSaveRename() {
    const trimmed = baseName.trim()
    if (!trimmed) {
      alert('Navnet kan ikke være tomt')
      return
    }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('transfers').update({ filename: trimmed + ext }).eq('id', transferId)
    setSaving(false)
    if (error) {
      alert('Kunne ikke lagre navnet. Prøv igjen.')
      return
    }
    setRenaming(false)
    router.refresh()
  }

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {renaming ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
          <input
            autoFocus
            value={baseName}
            onChange={e => setBaseName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSaveRename()
              if (e.key === 'Escape') { setRenaming(false); setBaseName(splitExtension(filename)[0]) }
            }}
            disabled={saving}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text,
              background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6,
              padding: '4px 6px', width: 160, outline: 'none',
            }}
          />
          {ext && <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>{ext}</span>}
          <button onClick={handleSaveRename} disabled={saving} style={{ ...linkStyle, padding: '4px 8px' }}>
            {saving ? '...' : 'Lagre'}
          </button>
          <button
            onClick={() => { setRenaming(false); setBaseName(splitExtension(filename)[0]) }}
            disabled={saving}
            style={{ ...linkStyle, border: `1px solid ${C.border}`, color: C.text2, background: 'none', padding: '4px 8px' }}
          >
            Avbryt
          </button>
        </div>
      ) : (
        <>
          {downloadUrl && (
            <a href={downloadUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>
              Åpne lenke
            </a>
          )}
          <button onClick={() => setRenaming(true)} style={{ ...linkStyle, border: `1px solid ${C.border}`, color: C.text2, background: 'none' }}>
            Endre navn
          </button>
          <button onClick={() => setEditing(true)} style={{ ...linkStyle, border: `1px solid ${C.border}`, color: C.text2, background: 'none' }}>
            Rediger utseende
          </button>
        </>
      )}
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
