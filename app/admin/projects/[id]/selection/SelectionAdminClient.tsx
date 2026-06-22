'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createAlbum, reorderAlbums, getAdminSelectionPage } from '@/lib/actions/selection-albums'
import { createGallery, purgeGalleryImages, reopenGallery, getSelectedFilenames } from '@/lib/actions/selections'
import AlbumCard from './AlbumCard'
import type { AdminSelectionPageData } from '@/lib/actions/selection-albums'
import { C } from '@/lib/admin-theme'

export default function SelectionAdminClient({
  projectId,
  projectName,
  initialData,
}: {
  projectId: string
  projectName: string
  initialData: AdminSelectionPageData | null
}) {
  const router = useRouter()
  const [data, setData] = useState(initialData)
  const [creating, setCreating] = useState(false)
  const [targetInput, setTargetInput] = useState('')
  const [newAlbumName, setNewAlbumName] = useState('')
  const [addingAlbum, setAddingAlbum] = useState(false)
  const [showAddAlbum, setShowAddAlbum] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedPin, setCopiedPin] = useState(false)
  const [copiedFilelist, setCopiedFilelist] = useState(false)
  const [purging, setPurging] = useState(false)
  const [reopening, setReopening] = useState(false)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  async function refresh() {
    const fresh = await getAdminSelectionPage(projectId)
    setData(fresh)
  }

  async function handleCreateGallery() {
    setCreating(true)
    await createGallery(projectId, parseInt(targetInput) || undefined)
    await refresh()
    setCreating(false)
    setTargetInput('')
  }

  async function handleAddAlbum() {
    if (!data || !newAlbumName.trim()) return
    setAddingAlbum(true)
    await createAlbum(data.gallery.id, newAlbumName.trim())
    await refresh()
    setAddingAlbum(false)
    setNewAlbumName('')
    setShowAddAlbum(false)
  }

  async function handlePurge() {
    if (!data || !confirm('Slett alle bildefiler? Valg og filnavn beholdes.')) return
    setPurging(true)
    await purgeGalleryImages(data.gallery.id)
    await refresh()
    setPurging(false)
  }

  async function handleReopen() {
    if (!data) return
    setReopening(true)
    await reopenGallery(data.gallery.id)
    await refresh()
    setReopening(false)
  }

  async function handleCopyFilelist() {
    if (!data) return
    const filenames = await getSelectedFilenames(data.gallery.id)
    await navigator.clipboard.writeText(filenames.join('\n'))
    setCopiedFilelist(true)
    setTimeout(() => setCopiedFilelist(false), 2000)
  }

  function copyText(text: string, setCopied: (v: boolean) => void) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem',
    textTransform: 'uppercase', letterSpacing: '0.08em', color: C.text3, marginBottom: 6,
  }
  const btnGhost: React.CSSProperties = {
    padding: '7px 12px', borderRadius: 6, border: `1px solid ${C.border}`,
    background: 'none', color: C.text2, fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', cursor: 'pointer',
  }
  const btnDanger: React.CSSProperties = {
    padding: '7px 12px', borderRadius: 6, border: `1px solid rgba(180,60,60,0.4)`,
    background: 'none', color: '#C05050', fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', cursor: 'pointer',
  }
  const copyBtnStyle: React.CSSProperties = {
    padding: '4px 8px', borderRadius: 5, border: `1px solid ${C.border}`,
    background: 'none', color: C.text2, fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', cursor: 'pointer',
  }

  // ---- Ingen galleri enda ----
  if (!data) {
    return (
      <div style={{ maxWidth: 560, margin: '48px auto', padding: '0 16px' }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, marginBottom: 4 }}>
          ← <button onClick={() => router.push(`/admin/projects/${projectId}`)} style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', fontSize: '0.72rem' }}>Tilbake til prosjekt</button>
        </p>
        <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.1rem', fontWeight: 700, color: C.text, marginBottom: 24 }}>
          Seleksjon — {projectName}
        </h1>
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
            <button onClick={handleCreateGallery} disabled={creating} style={{ padding: '9px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', background: C.accent, color: '#fff', fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, opacity: creating ? 0.7 : 1 }}>
              {creating ? 'Oppretter...' : 'Opprett galleri'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const { gallery, albums, totalSelected, totalImages } = data
  const galleryUrl = `${origin}/s/${gallery.token}`
  const isPurged = gallery.status === 'purged'
  const isSubmitted = gallery.status === 'submitted'
  const isOver = gallery.target_count != null && totalSelected > gallery.target_count

  const statusMap: Record<string, { label: string; color: string; bg: string }> = {
    open:      { label: 'Åpen', color: '#4CAF7D', bg: 'rgba(76,175,125,0.1)' },
    submitted: { label: 'Innsendt', color: C.accent, bg: C.accentBg },
    purged:    { label: 'Slettet', color: C.text3, bg: C.surface2 },
  }
  const statusStyle = statusMap[gallery.status] ?? statusMap.open

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      {/* Topbar */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => router.push(`/admin/projects/${projectId}`)} style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'var(--font-dm-sans)' }}>
          ← {projectName}
        </button>
        <span style={{ color: C.text3 }}>/</span>
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, color: C.text }}>Seleksjon</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {(isSubmitted || isPurged) && totalSelected > 0 && (
            <button onClick={handleCopyFilelist} style={btnGhost}>{copiedFilelist ? '✓ Kopiert' : 'Kopier filnavnliste'}</button>
          )}
          <button onClick={() => setShowAddAlbum(true)} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: C.accent, color: '#fff', fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
            + Nytt album
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', minHeight: 'calc(100vh - 49px)' }}>
        {/* Sidebar */}
        <div style={{ borderRight: `1px solid ${C.border}`, background: C.surface, padding: 16 }}>
          {/* Totalteller */}
          <div style={{ background: isOver ? 'rgba(212,134,58,0.08)' : 'rgba(196,148,52,0.06)', border: `1px solid ${isOver ? 'rgba(212,134,58,0.3)' : 'rgba(196,148,52,0.2)'}`, borderRadius: 8, padding: '10px 12px', textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.6rem', fontWeight: 700, color: isOver ? '#D4863A' : C.accent }}>
              {totalSelected}{gallery.target_count ? ` / ${gallery.target_count}` : ''}
            </div>
            <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginTop: 2 }}>
              bilder valgt på tvers av alle album
            </div>
          </div>

          {/* Status */}
          <div style={{ marginBottom: 16 }}>
            <div style={labelStyle}>Status</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${C.surface2}` }}>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2 }}>Galleri</span>
              <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: '0.65rem', fontWeight: 600, fontFamily: 'var(--font-dm-sans)', color: statusStyle.color, background: statusStyle.bg }}>{statusStyle.label}</span>
            </div>
            {gallery.submitted_at && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${C.surface2}` }}>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2 }}>Innsendt</span>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text, fontWeight: 600 }}>
                  {new Date(gallery.submitted_at).toLocaleDateString('nb-NO')}
                </span>
              </div>
            )}
          </div>

          {/* Hoved-gallerilenke */}
          <div style={{ marginBottom: 16 }}>
            <div style={labelStyle}>Hoved-gallerilenke</div>
            <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 10px' }}>
              <div style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: C.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>{galleryUrl}</div>
              <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text2 }}>PIN: <strong style={{ color: C.text, letterSpacing: '0.1em' }}>{gallery.pin_code}</strong></div>
              <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
                <button onClick={() => copyText(galleryUrl, setCopiedLink)} style={copyBtnStyle}>{copiedLink ? '✓' : 'Kopier lenke'}</button>
                <button onClick={() => copyText(gallery.pin_code, setCopiedPin)} style={copyBtnStyle}>{copiedPin ? '✓' : 'Kopier PIN'}</button>
              </div>
            </div>
          </div>

          {/* Handlinger */}
          <div style={labelStyle}>Handlinger</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {isSubmitted && !isPurged && (
              <button onClick={handleReopen} disabled={reopening} style={btnGhost}>{reopening ? 'Åpner...' : '↺ Åpne for redigering'}</button>
            )}
            {!isPurged && (
              <button onClick={handlePurge} disabled={purging} style={btnDanger}>{purging ? 'Sletter...' : '⊗ Slett bildefiler'}</button>
            )}
          </div>
        </div>

        {/* Album-liste */}
        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, color: C.text }}>Album</span>
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>
              {albums.length} album · {totalImages} bilder
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {albums.map(album => (
              <AlbumCard
                key={album.id}
                album={album}
                galleryId={gallery.id}
                onRefresh={refresh}
              />
            ))}

            {/* Legg til album */}
            {showAddAlbum ? (
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: '12px 14px', background: C.surface, display: 'flex', gap: 8 }}>
                <input
                  autoFocus
                  value={newAlbumName}
                  onChange={e => setNewAlbumName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddAlbum(); if (e.key === 'Escape') { setShowAddAlbum(false); setNewAlbumName('') } }}
                  placeholder="Albumnavn, f.eks. Headshots"
                  style={{ flex: 1, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 12px', color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', outline: 'none' }}
                />
                <button onClick={handleAddAlbum} disabled={addingAlbum || !newAlbumName.trim()} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: C.accent, color: '#fff', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                  {addingAlbum ? '...' : 'Legg til'}
                </button>
                <button onClick={() => { setShowAddAlbum(false); setNewAlbumName('') }} style={btnGhost}>Avbryt</button>
              </div>
            ) : (
              <button onClick={() => setShowAddAlbum(true)} style={{ border: `1.5px dashed ${C.border}`, borderRadius: 9, padding: '12px', textAlign: 'center', color: C.text3, fontSize: '0.78rem', cursor: 'pointer', background: 'none', width: '100%', fontFamily: 'var(--font-dm-sans)', transition: 'border-color 0.15s' }}>
                + Legg til album
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
