'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createGallery, searchProjectsToLink } from '@/lib/actions/selections'
import { C } from '@/lib/admin-theme'

type Mode = 'closed' | 'menu' | 'link-existing'

// Lar deg velge om galleriet som opprettes skal knyttes til et eksisterende
// prosjekt, et nytt prosjekt, eller forbli frittstående — se feedback cd7ab4ac.
export default function CreateStandaloneGalleryButton() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('closed')
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: string; title: string }[]>([])

  async function handleCreateStandalone() {
    setCreating(true)
    const { galleryId } = await createGallery()
    router.push(`/admin/selections/${galleryId}`)
  }

  async function handleSearch(value: string) {
    setQuery(value)
    if (!value.trim()) { setResults([]); return }
    const found = await searchProjectsToLink(value)
    setResults(found)
  }

  async function handleCreateLinked(projectId: string) {
    setCreating(true)
    const { galleryId } = await createGallery(projectId)
    router.push(`/admin/selections/${galleryId}`)
  }

  const buttonStyle = {
    padding: '9px 16px', borderRadius: 7, border: 'none', cursor: 'pointer',
    background: C.accent, color: '#fff', fontFamily: 'var(--font-dm-sans)',
    fontSize: '0.78rem', fontWeight: 600,
  }

  if (mode === 'closed') {
    return (
      <button onClick={() => setMode('menu')} style={buttonStyle}>
        + Opprett galleri
      </button>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <button disabled style={{ ...buttonStyle, opacity: 0.6 }}>+ Opprett galleri</button>
      <div style={{
        position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 10,
        width: 260, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9,
        padding: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      }}>
        {mode === 'menu' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button
              onClick={() => setMode('link-existing')}
              style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 6, border: 'none', background: 'none', color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = C.surface2}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}
            >
              Knytt til eksisterende prosjekt
            </button>
            <button
              onClick={() => router.push('/admin/projects/new')}
              style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 6, border: 'none', background: 'none', color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = C.surface2}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}
            >
              Opprett nytt prosjekt
            </button>
            <button
              onClick={handleCreateStandalone}
              disabled={creating}
              style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 6, border: 'none', background: 'none', color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = C.surface2}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}
            >
              {creating ? 'Oppretter...' : 'Frittstående galleri (uten prosjekt)'}
            </button>
            <button
              onClick={() => setMode('closed')}
              style={{ textAlign: 'left', padding: '6px 10px', marginTop: 2, borderRadius: 6, border: 'none', background: 'none', color: C.text3, fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', cursor: 'pointer' }}
            >
              Avbryt
            </button>
          </div>
        )}

        {mode === 'link-existing' && (
          <div>
            <input
              autoFocus
              value={query}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Søk etter prosjekt..."
              style={{ width: '100%', boxSizing: 'border-box', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 5, padding: '7px 9px', color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.76rem', outline: 'none', marginBottom: 6 }}
            />
            {results.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 160, overflowY: 'auto' }}>
                {results.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleCreateLinked(p.id)}
                    disabled={creating}
                    style={{ textAlign: 'left', padding: '6px 8px', borderRadius: 5, border: 'none', background: 'none', color: C.text2, fontFamily: 'var(--font-dm-sans)', fontSize: '0.76rem', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = C.surface2}
                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => { setMode('menu'); setQuery(''); setResults([]) }}
              style={{ marginTop: 6, textAlign: 'left', padding: '6px 8px', borderRadius: 5, border: 'none', background: 'none', color: C.text3, fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', cursor: 'pointer' }}
            >
              ← Tilbake
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
