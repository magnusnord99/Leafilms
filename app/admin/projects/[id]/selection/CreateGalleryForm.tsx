'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createGallery } from '@/lib/actions/selections'
import { C } from '@/lib/admin-theme'

export default function CreateGalleryForm({
  projectId,
  projectName,
}: {
  projectId: string
  projectName: string
}) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [targetInput, setTargetInput] = useState('')

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem',
    textTransform: 'uppercase', letterSpacing: '0.08em', color: C.text3, marginBottom: 6,
  }

  async function handleCreateGallery() {
    setCreating(true)
    const { galleryId } = await createGallery(projectId, parseInt(targetInput) || undefined)
    router.push(`/admin/selections/${galleryId}`)
  }

  return (
    <div style={{ maxWidth: 560, margin: '48px auto', padding: '0 16px' }}>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, marginBottom: 4 }}>
        <button onClick={() => router.push(`/admin/projects/${projectId}`)} style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', fontSize: '0.72rem' }}>← {projectName}</button>
      </p>
      <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.1rem', fontWeight: 700, color: C.text, marginBottom: 24 }}>Seleksjon</h1>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '20px 24px' }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text, fontWeight: 600, marginBottom: 16 }}>Opprett seleksjonsgalleri</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Måltall bilder (valgfritt)</label>
            <input
              type="number" min={1} value={targetInput}
              onChange={e => setTargetInput(e.target.value)}
              placeholder="f.eks. 20"
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 7, background: C.surface2, border: `1px solid ${C.border}`, color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', outline: 'none' }}
            />
          </div>
          <button onClick={handleCreateGallery} disabled={creating} style={{ padding: '9px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', background: C.accent, color: '#fff', fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600 }}>
            {creating ? 'Oppretter...' : 'Opprett galleri'}
          </button>
        </div>
      </div>
    </div>
  )
}
