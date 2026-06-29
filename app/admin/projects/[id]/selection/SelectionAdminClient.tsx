'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import {
  createAlbum, updateAlbum, deleteAlbum, deleteAlbumImage, deleteAllAlbumImages,
  enableAlbumSharing, disableAlbumSharing, updateAlbumPin, getAdminSelectionPage,
  moveImagesToAlbum,
} from '@/lib/actions/selection-albums'
import {
  createGallery, purgeGalleryImages, reopenGallery,
  getSelectedFilenames, registerUploadedImages,
} from '@/lib/actions/selections'
import type { AdminSelectionPageData, AlbumWithImages } from '@/lib/actions/selection-albums'
import { C } from '@/lib/admin-theme'

// ---------------------------------------------------------------------------
// Hoved-komponent
// ---------------------------------------------------------------------------
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
  const searchParams = useSearchParams()
  const backHref = searchParams?.get('from') ?? `/admin/projects/${projectId}`
  const [data, setData] = useState(initialData)
  const [creating, setCreating] = useState(false)
  const [targetInput, setTargetInput] = useState('')
  const [newAlbumName, setNewAlbumName] = useState('')
  const [addingAlbum, setAddingAlbum] = useState(false)
  const [showAddAlbum, setShowAddAlbum] = useState(false)
  // Path-basert navigasjon: array av album-IDer fra rot til gjeldende
  const [albumPath, setAlbumPath] = useState<string[]>([])
  const [copiedFilelist, setCopiedFilelist] = useState(false)
  const [purging, setPurging] = useState(false)
  const [reopening, setReopening] = useState(false)

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
    const album = await createAlbum(data.gallery.id, newAlbumName.trim())
    await refresh()
    setAddingAlbum(false)
    setNewAlbumName('')
    setShowAddAlbum(false)
    setAlbumPath([album.id])
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

  // ---- Ingen galleri enda ----
  if (!data) {
    return (
      <div style={{ maxWidth: 560, margin: '48px auto', padding: '0 16px' }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, marginBottom: 4 }}>
          <button onClick={() => router.push(backHref)} style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', fontSize: '0.72rem' }}>← {projectName}</button>
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

  const { gallery, albums, totalSelected, totalImages } = data
  const isOver = gallery.target_count != null && totalSelected > gallery.target_count
  const statusMap: Record<string, { label: string; color: string; bg: string }> = {
    open:      { label: 'Åpen', color: '#4CAF7D', bg: 'rgba(76,175,125,0.1)' },
    submitted: { label: 'Innsendt', color: C.accent, bg: C.accentBg },
    purged:    { label: 'Slettet', color: C.text3, bg: C.surface2 },
  }
  const statusStyle = statusMap[gallery.status] ?? statusMap.open

  // Aktiv album = siste element i path
  const activeAlbum = albumPath.length > 0
    ? albums.find(a => a.id === albumPath[albumPath.length - 1]) ?? null
    : null

  // Undermapper av aktivt album
  const activeAlbumChildren: AlbumWithImages[] = activeAlbum
    ? albums.filter(a => a.parent_album_id === activeAlbum.id)
    : []

  // Breadcrumb-segmenter fra albumPath
  const pathSegments = albumPath
    .map(id => albums.find(a => a.id === id))
    .filter((a): a is AlbumWithImages => Boolean(a))

  function handleNavigate(albumId: string) {
    setAlbumPath(prev => {
      const idx = prev.indexOf(albumId)
      if (idx !== -1) return prev.slice(0, idx + 1)
      return [...prev, albumId]
    })
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      {/* Topbar */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => router.push(backHref)} style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'var(--font-dm-sans)' }}>
          ← {projectName}
        </button>
        <span style={{ color: C.text3 }}>/</span>
        {/* "Seleksjon"-rot er klikkbar hvis vi er inne i et album */}
        <span
          onClick={() => setAlbumPath([])}
          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: pathSegments.length === 0 ? 600 : 400, color: pathSegments.length === 0 ? C.text : C.text3, cursor: pathSegments.length > 0 ? 'pointer' : 'default' }}
        >
          Seleksjon
        </span>
        {/* Full sti — alle segmenter bortsett fra siste er klikkbare */}
        {pathSegments.map((seg, idx) => {
          const isLast = idx === pathSegments.length - 1
          return (
            <span key={seg.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: C.text3 }}>/</span>
              <span
                onClick={() => !isLast && setAlbumPath(albumPath.slice(0, idx + 1))}
                style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem',
                  fontWeight: isLast ? 600 : 400,
                  color: isLast ? C.text : C.text3,
                  cursor: isLast ? 'default' : 'pointer',
                }}
              >
                {seg.name}
              </span>
            </span>
          )
        })}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {gallery.status !== 'open' && totalSelected > 0 && !activeAlbum && (
            <button onClick={handleCopyFilelist} style={btnGhost}>{copiedFilelist ? '✓ Kopiert' : 'Kopier filnavnliste'}</button>
          )}
          {!activeAlbum && (
            <button onClick={() => setShowAddAlbum(true)} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: C.accent, color: '#fff', fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
              + Nytt album
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', minHeight: 'calc(100vh - 49px)' }}>
        {/* Sidebar — alltid synlig */}
        <div style={{ borderRight: `1px solid ${C.border}`, background: C.surface, padding: 16 }}>
          <div style={{ background: isOver ? 'rgba(212,134,58,0.08)' : 'rgba(196,148,52,0.06)', border: `1px solid ${isOver ? 'rgba(212,134,58,0.3)' : 'rgba(196,148,52,0.2)'}`, borderRadius: 8, padding: '10px 12px', textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.6rem', fontWeight: 700, color: isOver ? '#D4863A' : C.accent }}>
              {totalSelected}{gallery.target_count ? ` / ${gallery.target_count}` : ''}
            </div>
            <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginTop: 2 }}>bilder valgt totalt</div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={labelStyle}>Status</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${C.surface2}` }}>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2 }}>Galleri</span>
              <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: '0.65rem', fontWeight: 600, fontFamily: 'var(--font-dm-sans)', color: statusStyle.color, background: statusStyle.bg }}>{statusStyle.label}</span>
            </div>
            {gallery.submitted_at && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0' }}>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2 }}>Innsendt</span>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text, fontWeight: 600 }}>
                  {new Date(gallery.submitted_at).toLocaleDateString('nb-NO')}
                </span>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={labelStyle}>Hoved-gallerilenke</div>
            <GalleryLinkBox token={gallery.token} pinCode={gallery.pin_code} />
          </div>

          <div style={labelStyle}>Handlinger</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {gallery.status === 'submitted' && (
              <button onClick={handleReopen} disabled={reopening} style={btnGhost}>{reopening ? 'Åpner...' : '↺ Åpne for redigering'}</button>
            )}
            {gallery.status !== 'purged' && (
              <button onClick={handlePurge} disabled={purging} style={btnDanger}>{purging ? 'Sletter...' : '⊗ Slett bildefiler'}</button>
            )}
          </div>
        </div>

        {/* Høyre panel — skifter mellom oversikt og detalj */}
        {activeAlbum ? (
          <AlbumDetailPanel
            key={activeAlbum.id}
            album={activeAlbum}
            galleryId={gallery.id}
            galleryPinCode={gallery.pin_code}
            onRefresh={refresh}
            onNavigate={handleNavigate}
            children={activeAlbumChildren}
            allAlbums={albums}
          />
        ) : (
          /* Album cover-grid */
          <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              {albums
                .filter(a => !a.parent_album_id)
                .map(album => (
                  <AdminAlbumCover
                    key={album.id}
                    album={album}
                    allAlbums={albums}
                    onClick={() => setAlbumPath([album.id])}
                  />
                ))}

              {showAddAlbum ? (
                <div style={{ borderRadius: 8, border: `1px solid ${C.border}`, overflow: 'hidden', background: C.surface }}>
                  <div style={{ aspectRatio: '16/9', background: C.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: C.text3, fontSize: '0.7rem', fontFamily: 'var(--font-dm-sans)' }}>Nytt album</span>
                  </div>
                  <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input
                      autoFocus value={newAlbumName}
                      onChange={e => setNewAlbumName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddAlbum(); if (e.key === 'Escape') { setShowAddAlbum(false); setNewAlbumName('') } }}
                      placeholder="Albumnavn"
                      style={{ width: '100%', boxSizing: 'border-box', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 5, padding: '6px 8px', color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', outline: 'none' }}
                    />
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button onClick={handleAddAlbum} disabled={addingAlbum || !newAlbumName.trim()} style={{ flex: 1, padding: '6px', borderRadius: 5, border: 'none', background: C.accent, color: '#fff', fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
                        {addingAlbum ? '...' : 'Legg til'}
                      </button>
                      <button onClick={() => { setShowAddAlbum(false); setNewAlbumName('') }} style={{ padding: '6px 10px', borderRadius: 5, border: `1px solid ${C.border}`, background: 'none', color: C.text2, fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', cursor: 'pointer' }}>
                        Avbryt
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddAlbum(true)}
                  style={{ borderRadius: 8, border: `1.5px dashed ${C.border}`, background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, aspectRatio: '1 / 1', color: C.text3 }}
                >
                  <span style={{ fontSize: '1.4rem' }}>+</span>
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem' }}>Nytt album</span>
                </button>
              )}
            </div>

            {albums.filter(a => !a.parent_album_id).length === 0 && !showAddAlbum && (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, textAlign: 'center', marginTop: 40 }}>
                {totalImages} bilder lastet opp — opprett album for å organisere dem
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Album cover-kort (lik kundensiden sin AlbumCard)
// ---------------------------------------------------------------------------
function countAdminAlbumTree(albumId: string, allAlbums: AlbumWithImages[]): { total: number; selected: number; cover: string | null } {
  const album = allAlbums.find(a => a.id === albumId)
  if (!album) return { total: 0, selected: 0, cover: null }

  let total = album.images.length
  let selected = album.selectedCount
  let cover = album.images[0]?.signedUrl || null

  for (const child of allAlbums.filter(a => a.parent_album_id === albumId)) {
    const sub = countAdminAlbumTree(child.id, allAlbums)
    total += sub.total
    selected += sub.selected
    if (!cover) cover = sub.cover
  }

  return { total, selected, cover }
}

function AdminAlbumCover({ album, allAlbums, onClick }: { album: AlbumWithImages; allAlbums?: AlbumWithImages[]; onClick: () => void }) {
  const { total, selected, cover } = allAlbums
    ? countAdminAlbumTree(album.id, allAlbums)
    : { total: album.images.length, selected: album.selectedCount, cover: album.images[0]?.signedUrl || null }

  return (
    <div
      onClick={onClick}
      style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border}`, cursor: 'pointer', background: C.surface, transition: 'border-color 0.15s' }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.text3}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.border}
    >
      <div style={{ aspectRatio: '16/9', background: C.surface2, overflow: 'hidden', position: 'relative' }}>
        {cover
          ? <img src={cover} alt={album.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '1.5rem', color: C.text3 }}>📁</span>
            </div>
        }
        {selected > 0 && (
          <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(124,92,252,0.9)', color: '#fff', fontSize: '0.6rem', fontWeight: 700, fontFamily: 'var(--font-dm-sans)', padding: '2px 7px', borderRadius: 8 }}>
            {selected} valgt
          </div>
        )}
      </div>
      <div style={{ padding: '9px 11px' }}>
        <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, color: C.text }}>{album.name}</div>
        <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginTop: 2 }}>{total} bilder</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Gallerilenke-boks
// ---------------------------------------------------------------------------
function GalleryLinkBox({ token, pinCode }: { token: string; pinCode: string }) {
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedPin, setCopiedPin] = useState(false)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const url = `${origin}/s/${token}`

  function copy(text: string, set: (v: boolean) => void) {
    navigator.clipboard.writeText(text)
    set(true)
    setTimeout(() => set(false), 2000)
  }

  const copyBtnStyle: React.CSSProperties = {
    padding: '4px 8px', borderRadius: 5, border: `1px solid ${C.border}`,
    background: 'none', color: C.text2, fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', cursor: 'pointer',
  }

  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 10px' }}>
      <div style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: C.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>{url}</div>
      <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text2 }}>PIN: <strong style={{ color: C.text, letterSpacing: '0.1em' }}>{pinCode}</strong></div>
      <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
        <button onClick={() => copy(url, setCopiedLink)} style={copyBtnStyle}>{copiedLink ? '✓' : 'Kopier lenke'}</button>
        <button onClick={() => copy(pinCode, setCopiedPin)} style={copyBtnStyle}>{copiedPin ? '✓' : 'Kopier PIN'}</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Albumdetalj-panel — lever i høyre kolonne, sidebar er alltid synlig
// ---------------------------------------------------------------------------
function AlbumDetailPanel({
  album,
  galleryId,
  galleryPinCode,
  onRefresh,
  onNavigate,
  children,
  allAlbums,
}: {
  album: AlbumWithImages
  galleryId: string
  galleryPinCode: string
  onRefresh: () => Promise<void>
  onNavigate: (albumId: string) => void
  children: AlbumWithImages[]
  allAlbums: AlbumWithImages[]
}) {
  const [sharingOn, setSharingOn] = useState(!!album.album_token)
  const [sharingLoading, setSharingLoading] = useState(false)
  const [albumToken, setAlbumToken] = useState(album.album_token)
  const [albumPin, setAlbumPin] = useState(album.album_pin_code)
  const [useGalleryPin, setUseGalleryPin] = useState(
    !!album.album_pin_code && album.album_pin_code === galleryPinCode
  )
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedPin, setCopiedPin] = useState(false)
  const [uploads, setUploads] = useState<{ filename: string; progress: 'pending' | 'uploading' | 'done' | 'error' }[]>([])
  const [dragging, setDragging] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Undermappe-opprettelse
  const [showAddSubAlbum, setShowAddSubAlbum] = useState(false)
  const [newSubAlbumName, setNewSubAlbumName] = useState('')
  const [addingSubAlbum, setAddingSubAlbum] = useState(false)

  // Velg-modus og bildeflytting
  const [selectMode, setSelectMode] = useState(false)
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set())
  const [moveTarget, setMoveTarget] = useState<string>('')
  const [moving, setMoving] = useState(false)

  // Lightbox
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const [deletingAll, setDeletingAll] = useState(false)

  // Rename
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(album.name)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renaming) renameInputRef.current?.select()
  }, [renaming])

  async function handleRename() {
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === album.name) { setRenaming(false); return }
    await updateAlbum(album.id, { name: trimmed })
    await onRefresh()
    setRenaming(false)
  }

  useEffect(() => {
    if (lightboxIndex === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') setLightboxIndex(p => p !== null ? Math.min(p + 1, album.images.length - 1) : null)
      if (e.key === 'ArrowLeft') setLightboxIndex(p => p !== null ? Math.max(p - 1, 0) : null)
      if (e.key === 'Escape') setLightboxIndex(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIndex, album.images.length])

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const albumUrl = albumToken ? `${origin}/s/${albumToken}` : ''

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem',
    textTransform: 'uppercase', letterSpacing: '0.08em', color: C.text3, marginBottom: 6,
  }

  async function handleToggleSharing() {
    setSharingLoading(true)
    if (sharingOn) {
      await disableAlbumSharing(album.id)
      setAlbumToken(null); setAlbumPin(null); setSharingOn(false)
    } else {
      const pin = useGalleryPin ? galleryPinCode : undefined
      const { token, pinCode } = await enableAlbumSharing(album.id, undefined, pin)
      setAlbumToken(token); setAlbumPin(pinCode); setSharingOn(true)
    }
    setSharingLoading(false)
    await onRefresh()
  }

  async function handleToggleGalleryPin(checked: boolean) {
    setUseGalleryPin(checked)
    if (sharingOn) {
      const newPin = checked ? galleryPinCode : String(Math.floor(1000 + Math.random() * 9000))
      setSharingLoading(true)
      await updateAlbumPin(album.id, newPin)
      setAlbumPin(newPin)
      setSharingLoading(false)
      await onRefresh()
    }
  }

  async function handleFiles(files: File[]) {
    const imageFiles = files.filter(f => f.type.startsWith('image/'))
    if (!imageFiles.length) return

    const currentMax = album.images.reduce((m, i) => Math.max(m, i.sort_order), -1)
    setUploads(imageFiles.map(f => ({ filename: f.name, progress: 'pending' as const })))

    const uploaded: { filename: string; storagePath: string; sortOrder: number; albumId: string }[] = []
    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i]
      setUploads(prev => prev.map((u, idx) => idx === i ? { ...u, progress: 'uploading' as const } : u))
      const path = `${galleryId}/${album.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error } = await supabase.storage.from('selections').upload(path, file, { contentType: file.type, upsert: false })
      if (error) {
        setUploads(prev => prev.map((u, idx) => idx === i ? { ...u, progress: 'error' as const } : u))
      } else {
        setUploads(prev => prev.map((u, idx) => idx === i ? { ...u, progress: 'done' as const } : u))
        uploaded.push({ filename: file.name, storagePath: path, sortOrder: currentMax + i + 1, albumId: album.id })
      }
    }
    if (uploaded.length > 0) { await registerUploadedImages(galleryId, uploaded); await onRefresh() }
    setTimeout(() => setUploads([]), 2000)
  }

  async function handleDeleteImage(imageId: string, storagePath: string | null) {
    if (!confirm('Slett dette bildet fra albumet?')) return
    setDeletingId(imageId)
    await deleteAlbumImage(imageId, storagePath)
    await onRefresh()
    setDeletingId(null)
  }

  async function handleAddSubAlbum() {
    if (!newSubAlbumName.trim()) return
    setAddingSubAlbum(true)
    const newAlbum = await createAlbum(galleryId, newSubAlbumName.trim(), album.id)
    await onRefresh()
    setAddingSubAlbum(false)
    setNewSubAlbumName('')
    setShowAddSubAlbum(false)
    onNavigate(newAlbum.id)
  }

  async function handleDeleteAll() {
    if (!confirm(`Slett alle ${album.images.length} bilder i "${album.name}"? Dette kan ikke angres.`)) return
    setDeletingAll(true)
    await deleteAllAlbumImages(album.id)
    await onRefresh()
    setDeletingAll(false)
  }

  async function handleMoveImages() {
    if (!moveTarget || selectedImageIds.size === 0) return
    setMoving(true)
    await moveImagesToAlbum(Array.from(selectedImageIds), moveTarget)
    await onRefresh()
    setSelectedImageIds(new Set())
    setMoveTarget('')
    setSelectMode(false)
    setMoving(false)
  }

  function toggleImageSelection(imageId: string) {
    setSelectedImageIds(prev => {
      const next = new Set(prev)
      if (next.has(imageId)) next.delete(imageId)
      else next.add(imageId)
      return next
    })
  }

  function copy(text: string, set: (v: boolean) => void) {
    navigator.clipboard.writeText(text); set(true); setTimeout(() => set(false), 2000)
  }

  const btnSm: React.CSSProperties = {
    padding: '4px 8px', borderRadius: 5, border: `1px solid ${C.border}`,
    background: 'none', color: C.text2, fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', cursor: 'pointer',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Album-toolbar */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, background: C.surface }}>
        {/* Mappenavn med inline rename */}
        {renaming ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setRenameValue(album.name); setRenaming(false) } }}
              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, color: C.text, background: C.surface2, border: `1px solid ${C.accent}`, borderRadius: 5, padding: '3px 8px', outline: 'none', width: 180 }}
            />
            <button onClick={handleRename} style={{ background: C.accent, border: 'none', borderRadius: 5, color: '#fff', fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', padding: '4px 8px', cursor: 'pointer' }}>Lagre</button>
            <button onClick={() => { setRenameValue(album.name); setRenaming(false) }} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 5, color: C.text3, fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', padding: '4px 8px', cursor: 'pointer' }}>Avbryt</button>
          </div>
        ) : (
          <button
            onClick={() => { setRenameValue(album.name); setRenaming(true) }}
            title="Endre mappenavn"
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, color: C.text, display: 'flex', alignItems: 'center', gap: 5 }}
            onMouseEnter={e => (e.currentTarget.querySelector('span') as HTMLElement | null)?.style.setProperty('opacity', '1')}
            onMouseLeave={e => (e.currentTarget.querySelector('span') as HTMLElement | null)?.style.setProperty('opacity', '0')}
          >
            {album.name}
            <span style={{ fontSize: '0.65rem', color: C.text3, opacity: 0, transition: 'opacity 0.12s' }}>✎</span>
          </button>
        )}
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
          · {album.images.length} bilder · {album.selectedCount} valgt
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Slett alle bilder */}
          {album.images.length > 0 && !selectMode && (
            <button
              onClick={handleDeleteAll}
              disabled={deletingAll}
              style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid rgba(180,60,60,0.4)`, background: 'none', color: '#C05050', fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', cursor: 'pointer', opacity: deletingAll ? 0.5 : 1 }}
            >
              {deletingAll ? 'Sletter...' : '⊗ Slett alle bilder'}
            </button>
          )}

          {/* Velg-modus-knapp */}
          <button
            onClick={() => {
              setSelectMode(prev => !prev)
              setSelectedImageIds(new Set())
            }}
            style={{
              padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.border}`,
              background: 'none', color: selectMode ? C.accent : C.text2,
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', cursor: 'pointer',
              borderColor: selectMode ? C.accent : C.border,
            }}
          >
            {selectMode ? 'Avbryt' : 'Velg bilder'}
          </button>

          {/* Ny undermappe-knapp */}
          <button
            onClick={() => setShowAddSubAlbum(true)}
            style={{
              padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.border}`,
              background: 'none', color: C.text2, fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', cursor: 'pointer',
            }}
          >
            + Ny undermappe
          </button>

          {/* Individuell delelenke */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: sharingOn ? 'rgba(100,160,220,0.06)' : C.surface2, border: `1px solid ${sharingOn ? 'rgba(100,160,220,0.3)' : C.border}` }}>
            {sharingOn && albumUrl ? (
              <>
                <span style={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#64A0DC', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{albumUrl}</span>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3 }}>PIN: <strong style={{ color: C.text }}>{albumPin}</strong></span>
                <button onClick={() => copy(albumUrl, setCopiedLink)} style={btnSm}>{copiedLink ? '✓' : 'Lenke'}</button>
                <button onClick={() => copy(albumPin!, setCopiedPin)} style={btnSm}>{copiedPin ? '✓' : 'PIN'}</button>
              </>
            ) : (
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>Individuell lenke — av</span>
            )}
            {/* Felles PIN-toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', opacity: sharingLoading ? 0.5 : 1 }}>
              <input
                type="checkbox"
                checked={useGalleryPin}
                onChange={e => handleToggleGalleryPin(e.target.checked)}
                disabled={sharingLoading}
                style={{ accentColor: '#64A0DC', width: 11, height: 11, cursor: 'pointer' }}
              />
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, whiteSpace: 'nowrap' }}>Felles PIN</span>
            </label>
            <button
              onClick={handleToggleSharing} disabled={sharingLoading}
              style={{ width: 34, height: 18, borderRadius: 9, border: 'none', position: 'relative', background: sharingOn ? 'rgba(100,160,220,0.3)' : C.surface, cursor: 'pointer', flexShrink: 0 }}
            >
              <div style={{ position: 'absolute', width: 12, height: 12, borderRadius: '50%', top: 3, left: sharingOn ? 19 : 3, background: sharingOn ? '#64A0DC' : C.text3, transition: 'left 0.15s' }} />
            </button>
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: C.accent, color: '#fff', fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}
          >
            + Last opp bilder
          </button>
          <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/jpg,image/png,image/webp" style={{ display: 'none' }} onChange={e => { if (e.target.files) handleFiles(Array.from(e.target.files)) }} />
        </div>
      </div>

      {/* Flytt-valgte bar — vises kun i selectMode med valgte bilder */}
      {selectMode && selectedImageIds.size > 0 && (
        <div style={{ padding: '8px 20px', background: C.surface, borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2 }}>
            {selectedImageIds.size} valgt
          </span>
          <select
            value={moveTarget}
            onChange={e => setMoveTarget(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: 5, border: `1px solid ${C.border}`, background: C.surface2, color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', cursor: 'pointer' }}
          >
            <option value="">Flytt til mappe...</option>
            {allAlbums.filter(a => a.id !== album.id).map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button
            onClick={handleMoveImages}
            disabled={!moveTarget || moving}
            style={{ padding: '5px 12px', borderRadius: 5, border: 'none', background: C.accent, color: '#fff', fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', opacity: (!moveTarget || moving) ? 0.5 : 1 }}
          >
            {moving ? 'Flytter...' : 'Flytt'}
          </button>
        </div>
      )}

      {/* Inline opprett-undermappe form */}
      {showAddSubAlbum && (
        <div style={{ padding: '10px 20px', background: C.surface, borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            autoFocus
            value={newSubAlbumName}
            onChange={e => setNewSubAlbumName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddSubAlbum(); if (e.key === 'Escape') { setShowAddSubAlbum(false); setNewSubAlbumName('') } }}
            placeholder="Navn på undermappe"
            style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface2, color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', outline: 'none', minWidth: 200 }}
          />
          <button
            onClick={handleAddSubAlbum}
            disabled={addingSubAlbum || !newSubAlbumName.trim()}
            style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: C.accent, color: '#fff', fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', opacity: (addingSubAlbum || !newSubAlbumName.trim()) ? 0.5 : 1 }}
          >
            {addingSubAlbum ? '...' : 'Opprett'}
          </button>
          <button
            onClick={() => { setShowAddSubAlbum(false); setNewSubAlbumName('') }}
            style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'none', color: C.text2, fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', cursor: 'pointer' }}
          >
            Avbryt
          </button>
        </div>
      )}

      {/* Upload-status */}
      {uploads.length > 0 && (
        <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '5px 20px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {uploads.map((u, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: u.progress === 'done' ? '#4CAF7D' : u.progress === 'error' ? '#C05050' : u.progress === 'uploading' ? C.accent : C.text3 }} />
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text2 }}>{u.filename}</span>
            </div>
          ))}
        </div>
      )}

      {/* Bildegrid */}
      <div
        style={{ flex: 1, overflowY: 'auto', padding: 16 }}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(Array.from(e.dataTransfer.files)) }}
      >
        {dragging && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(124,92,252,0.12)', border: `3px dashed ${C.accent}`, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.1rem', color: C.accent, fontWeight: 600 }}>Slipp for å laste opp</span>
          </div>
        )}

        {/* Undermapper-seksjon */}
        {children.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: C.text3, marginBottom: 8 }}>
              Undermapper
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
              {children.map(child => (
                <AdminAlbumCover
                  key={child.id}
                  album={child}
                  allAlbums={allAlbums}
                  onClick={() => onNavigate(child.id)}
                />
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
          {album.images.map((img, idx) => {
            const isSelected = selectedImageIds.has(img.id)
            return (
              <div
                key={img.id}
                className="admin-img-card"
                onClick={() => selectMode ? toggleImageSelection(img.id) : setLightboxIndex(idx)}
                style={{
                  borderRadius: 7, overflow: 'hidden',
                  border: `2px solid ${isSelected ? C.accent : 'transparent'}`,
                  background: C.surface2, position: 'relative',
                  opacity: deletingId === img.id ? 0.4 : 1,
                  transition: 'opacity 0.15s, border-color 0.1s',
                  cursor: 'pointer',
                }}
              >
                <div style={{ position: 'relative', aspectRatio: '4/3' }}>
                  {img.signedUrl
                    ? <img src={img.signedUrl} alt={img.filename} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                    : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '0.55rem', color: C.text3, padding: 4, textAlign: 'center' }}>{img.filename}</span>
                      </div>
                  }
                  {/* Checkmark-overlay ved seleksjon */}
                  {selectMode && isSelected && (
                    <div style={{ position: 'absolute', top: 4, left: 4, width: 18, height: 18, borderRadius: '50%', background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                      <svg width="8" height="8" viewBox="0 0 10 10"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </div>
                  )}
                  {img.selected && (
                    <div style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: '50%', background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="8" height="8" viewBox="0 0 10 10"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </div>
                  )}
                  {img.comment && (
                    <div style={{ position: 'absolute', top: 4, left: isSelected ? 26 : 4, width: 7, height: 7, borderRadius: '50%', background: '#C49434' }} />
                  )}
                  {!selectMode && (
                    <button
                      className="admin-img-delete"
                      onClick={() => handleDeleteImage(img.id, img.storage_path)}
                      disabled={deletingId === img.id}
                      title="Slett bilde"
                      style={{
                        position: 'absolute', bottom: 4, right: 4,
                        width: 22, height: 22, borderRadius: 5, border: 'none',
                        background: 'rgba(180,60,60,0.85)', color: '#fff',
                        fontSize: '0.75rem', cursor: 'pointer', display: 'none',
                        alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                      }}
                    >×</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {album.images.length === 0 && children.length === 0 && (
          <div onClick={() => fileInputRef.current?.click()} style={{ border: `2px dashed ${C.border}`, borderRadius: 10, padding: '60px 20px', textAlign: 'center', cursor: 'pointer' }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text3 }}>
              Dra og slipp bilder her, eller klikk for å velge
            </p>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (() => {
        const img = album.images[lightboxIndex]
        return (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(10,9,8,0.97)', display: 'flex', flexDirection: 'column', zIndex: 200 }}
            onClick={() => setLightboxIndex(null)}
          >
            {/* Topbar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {img.selected && (
                  <span style={{ padding: '2px 8px', borderRadius: 10, background: C.accentBg, color: C.accent, fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 600 }}>Valgt av kunde</span>
                )}
                {img.comment && (
                  <span style={{ padding: '2px 8px', borderRadius: 10, background: 'rgba(196,148,52,0.1)', color: '#C49434', fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem' }}>Kommentar</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: '#5A5448' }}>{lightboxIndex + 1} / {album.images.length}</span>
                <button onClick={() => setLightboxIndex(null)} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.08)', color: '#E8E0D0', fontSize: '1rem', cursor: 'pointer' }}>×</button>
              </div>
            </div>

            {/* Bilde */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: 0, padding: '0 60px' }} onClick={e => e.stopPropagation()}>
              {img.signedUrl && (
                <img src={img.signedUrl} alt={img.filename} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 4, display: 'block' }} />
              )}
              {lightboxIndex > 0 && (
                <button onClick={() => setLightboxIndex(p => p !== null ? p - 1 : null)} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.08)', color: '#E8E0D0', fontSize: '1.4rem', cursor: 'pointer' }}>‹</button>
              )}
              {lightboxIndex < album.images.length - 1 && (
                <button onClick={() => setLightboxIndex(p => p !== null ? p + 1 : null)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.08)', color: '#E8E0D0', fontSize: '1.4rem', cursor: 'pointer' }}>›</button>
              )}
            </div>

            {/* Bunntekst */}
            <div style={{ padding: '10px 16px', flexShrink: 0, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: '#5A5448', margin: 0 }}>{img.filename}</p>
              {img.comment && (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: '#C49434', marginTop: 6, fontStyle: 'italic' }}>"{img.comment}"</p>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
