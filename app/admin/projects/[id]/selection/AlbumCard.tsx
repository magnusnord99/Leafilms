'use client'

import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase-client'
import {
  updateAlbum,
  deleteAlbum,
  enableAlbumSharing,
  disableAlbumSharing,
} from '@/lib/actions/selection-albums'
import { registerUploadedImages } from '@/lib/actions/selections'
import type { AlbumWithImages } from '@/lib/actions/selection-albums'
import { C } from '@/lib/admin-theme'

type UploadStatus = { filename: string; progress: 'pending' | 'uploading' | 'done' | 'error'; error?: string }

export default function AlbumCard({
  album,
  galleryId,
  onRefresh,
}: {
  album: AlbumWithImages
  galleryId: string
  onRefresh: () => Promise<void>
}) {
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(album.name)
  const [savingName, setSavingName] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [sharingOn, setSharingOn] = useState(!!album.album_token)
  const [sharingLoading, setSharingLoading] = useState(false)
  const [albumToken, setAlbumToken] = useState(album.album_token)
  const [albumPin, setAlbumPin] = useState(album.album_pin_code)
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedPin, setCopiedPin] = useState(false)
  const [uploads, setUploads] = useState<UploadStatus[]>([])
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const albumUrl = albumToken ? `${origin}/s/${albumToken}` : ''

  async function saveName() {
    if (!nameInput.trim() || nameInput === album.name) { setEditingName(false); return }
    setSavingName(true)
    await updateAlbum(album.id, { name: nameInput.trim() })
    await onRefresh()
    setSavingName(false)
    setEditingName(false)
  }

  async function handleDelete() {
    if (!confirm(`Slett albumet "${album.name}" og alle bilder i det?`)) return
    setDeleting(true)
    await deleteAlbum(album.id)
    await onRefresh()
  }

  async function handleToggleSharing() {
    setSharingLoading(true)
    if (sharingOn) {
      await disableAlbumSharing(album.id)
      setAlbumToken(null)
      setAlbumPin(null)
      setSharingOn(false)
    } else {
      const { token, pinCode } = await enableAlbumSharing(album.id)
      setAlbumToken(token)
      setAlbumPin(pinCode)
      setSharingOn(true)
    }
    setSharingLoading(false)
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
      const { error } = await supabase.storage.from('selections').upload(path, file, {
        contentType: file.type,
        upsert: false,
      })

      if (error) {
        setUploads(prev => prev.map((u, idx) => idx === i ? { ...u, progress: 'error' as const, error: error.message } : u))
      } else {
        setUploads(prev => prev.map((u, idx) => idx === i ? { ...u, progress: 'done' as const } : u))
        uploaded.push({ filename: file.name, storagePath: path, sortOrder: currentMax + i + 1, albumId: album.id })
      }
    }

    if (uploaded.length > 0) {
      await registerUploadedImages(galleryId, uploaded)
      await onRefresh()
    }
    setTimeout(() => setUploads([]), 2000)
  }

  function copyText(text: string, setCopied: (v: boolean) => void) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const btnBase: React.CSSProperties = {
    padding: '4px 10px', borderRadius: 5, border: `1px solid ${C.border}`,
    background: 'none', color: C.text2, fontFamily: 'var(--font-dm-sans)',
    fontSize: '0.68rem', cursor: 'pointer',
  }

  return (
    <div style={{ border: `1px solid ${sharingOn ? 'rgba(100,160,220,0.3)' : C.border}`, borderRadius: 9, overflow: 'hidden', background: C.surface }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: C.text3, fontSize: '0.85rem', cursor: 'grab' }}>⠿</span>
        {editingName ? (
          <input
            autoFocus
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onBlur={saveName}
            onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
            style={{ flex: 1, background: 'none', border: `1px solid ${C.border}`, borderRadius: 5, padding: '3px 8px', color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.88rem', outline: 'none' }}
          />
        ) : (
          <span
            onDoubleClick={() => setEditingName(true)}
            style={{ flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.88rem', fontWeight: 600, color: C.text, cursor: 'text' }}
            title="Dobbeltklikk for å redigere"
          >
            {album.name}
          </span>
        )}
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, background: C.surface2, borderRadius: 10, padding: '1px 8px' }}>
          {album.images.length} bilder · {album.selectedCount} valgt
        </span>
        <button onClick={() => setEditingName(true)} style={btnBase}>Rediger</button>
        <button onClick={handleDelete} disabled={deleting} style={{ ...btnBase, borderColor: 'rgba(180,60,60,0.4)', color: '#C05050' }}>
          {deleting ? '...' : 'Slett'}
        </button>
      </div>

      {/* Thumbnail-grid */}
      <div style={{ padding: '0 14px 10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))', gap: 4, marginBottom: 10 }}>
          {album.images.slice(0, 12).map(img => (
            <div key={img.id} style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 4, overflow: 'hidden', border: `2px solid ${img.selected ? C.accent : 'transparent'}` }}>
              {img.signedUrl
                ? <img src={img.signedUrl} alt={img.filename} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                : <div style={{ width: '100%', height: '100%', background: C.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '0.45rem', color: C.text3 }}>{img.filename}</span>
                  </div>
              }
              {img.selected && (
                <div style={{ position: 'absolute', top: 2, right: 2, width: 12, height: 12, borderRadius: '50%', background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="6" height="6" viewBox="0 0 10 10"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              )}
            </div>
          ))}

          {/* Opplastingssone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(Array.from(e.dataTransfer.files)) }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              aspectRatio: '4/3', borderRadius: 4, border: `1.5px dashed ${dragging ? C.accent : C.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: dragging ? C.accent : C.text3, fontSize: '1.1rem',
              background: dragging ? C.accentBg : 'none',
            }}
          >+</div>
          <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/jpg,image/png,image/webp" style={{ display: 'none' }} onChange={e => { if (e.target.files) handleFiles(Array.from(e.target.files)) }} />
        </div>

        {/* Opplastingsstatus */}
        {uploads.length > 0 && (
          <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {uploads.map((u, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: u.progress === 'done' ? '#4CAF7D' : u.progress === 'error' ? C.danger : u.progress === 'uploading' ? C.accent : C.text3, flexShrink: 0 }} />
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.filename}</span>
              </div>
            ))}
          </div>
        )}

        {/* Individuell delelenke toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, background: sharingOn ? 'rgba(100,160,220,0.06)' : C.surface2, border: `1px solid ${sharingOn ? 'rgba(100,160,220,0.25)' : C.border}` }}>
          <span style={{ fontSize: '0.78rem' }}>🔗</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {sharingOn && albumToken ? (
              <>
                <div style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: '#64A0DC', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {origin}/s/{albumToken}
                </div>
                <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3, marginTop: 1 }}>
                  PIN: <strong style={{ color: C.text, letterSpacing: '0.08em' }}>{albumPin}</strong>
                </div>
                <div style={{ display: 'flex', gap: 5, marginTop: 4 }}>
                  <button onClick={() => copyText(`${origin}/s/${albumToken}`, setCopiedLink)} style={{ ...btnBase, fontSize: '0.6rem' }}>{copiedLink ? '✓' : 'Kopier lenke'}</button>
                  <button onClick={() => copyText(albumPin!, setCopiedPin)} style={{ ...btnBase, fontSize: '0.6rem' }}>{copiedPin ? '✓' : 'Kopier PIN'}</button>
                </div>
              </>
            ) : (
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>
                Individuell delelenke — ikke aktivert
              </span>
            )}
          </div>
          <button
            onClick={handleToggleSharing}
            disabled={sharingLoading}
            style={{
              width: 36, height: 20, borderRadius: 10, border: 'none', flexShrink: 0,
              background: sharingOn ? 'rgba(100,160,220,0.3)' : C.surface,
              cursor: 'pointer', position: 'relative', transition: 'background 0.15s',
            }}
          >
            <div style={{
              position: 'absolute', width: 14, height: 14, borderRadius: '50%', top: 3,
              left: sharingOn ? 19 : 3,
              background: sharingOn ? '#64A0DC' : C.text3,
              transition: 'left 0.15s, background 0.15s',
            }} />
          </button>
        </div>
      </div>
    </div>
  )
}
