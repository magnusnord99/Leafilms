'use client'

import { useEffect, useRef, useState } from 'react'
import {
  getTaskVideoFileSignedUrl, getTaskFileComments, addTaskFileComment, resolveTaskFileComment,
} from '@/lib/actions/task-video-files'
import type { TaskFileComment } from '@/lib/actions/task-video-files'
import { C } from '@/lib/admin-theme'

function formatTs(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// Reviewspiller for en opplastet postprod-fil — video + tidsankrede
// kommentarer, inline i selve steget (erstatter den frittstående
// /admin/task-file-reviews-siden). Native <video controls> gir fullskjerm
// gratis, så ingen egen fullskjerm-håndtering er nødvendig her.
export function TaskFileReviewPlayer({ fileId }: { fileId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [comments, setComments] = useState<TaskFileComment[]>([])
  const [addingAt, setAddingAt] = useState<number | null>(null)
  const [commentText, setCommentText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setUrl(null)
    setError(false)
    getTaskVideoFileSignedUrl(fileId).then(u => {
      if (cancelled) return
      if (u) setUrl(u)
      else setError(true)
    })
    getTaskFileComments(fileId).then(c => { if (!cancelled) setComments(c) })
    return () => { cancelled = true }
  }, [fileId])

  function openCommentForm() {
    const vid = videoRef.current
    if (!vid) return
    vid.pause()
    setAddingAt(vid.currentTime)
    setCommentText('')
  }

  async function submitComment() {
    if (!commentText.trim() || addingAt === null) return
    setSaving(true)
    const result = await addTaskFileComment(fileId, commentText.trim(), Math.floor(addingAt))
    setSaving(false)
    if ('error' in result) { alert(result.error); return }
    setComments(prev => [...prev, result.comment].sort((a, b) => (a.timestamp_seconds ?? 0) - (b.timestamp_seconds ?? 0)))
    setAddingAt(null)
    setCommentText('')
  }

  async function toggleResolved(comment: TaskFileComment) {
    setComments(prev => prev.map(c => c.id === comment.id ? { ...c, resolved: !c.resolved } : c))
    await resolveTaskFileComment(comment.id, !comment.resolved)
  }

  function jumpTo(secs: number | null) {
    const vid = videoRef.current
    if (!vid || secs === null) return
    vid.currentTime = secs
    vid.play()
  }

  // Klikk på selve videobildet (ikke kontrollbaren nederst) spiller av/pauser
  // — i tillegg til de native kontrollene, siden play-knappen i den native
  // kontrollbaren ikke alltid registrerer klikk pålitelig i alle nettlesere/
  // oppsett (observert 2026-09-21: video lastet og var klar til avspilling,
  // men klikk på den native play-knappen gjorde ingenting — .play() fra
  // konsollen virket derimot fint). Ignorerer klikk i de nederste ~40px der
  // kontrollbaren selv ligger, for ikke å dobbelt-trigge når den native
  // knappen faktisk fungerer.
  function handleVideoClick(e: React.MouseEvent<HTMLVideoElement>) {
    const vid = videoRef.current
    if (!vid) return
    const rect = vid.getBoundingClientRect()
    const clickedInControlBar = e.clientY - rect.top > rect.height - 40
    if (clickedInControlBar) return
    if (vid.paused) vid.play()
    else vid.pause()
  }

  if (error) {
    return (
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.danger, padding: '10px 0' }}>
        Kunne ikke laste forhåndsvisning
      </p>
    )
  }

  if (!url) {
    return (
      <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.surface2, borderRadius: 8 }}>
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>Laster forhåndsvisning...</span>
      </div>
    )
  }

  return (
    <div>
      <video
        ref={videoRef}
        controls
        preload="auto"
        src={url}
        onClick={handleVideoClick}
        style={{ width: '100%', minHeight: 200, borderRadius: 8, background: '#000', maxHeight: 420, display: 'block', cursor: 'pointer' }}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
        <label style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 600, color: C.text3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Kommentarer {comments.length > 0 ? `(${comments.length})` : ''}
        </label>
        <button
          onClick={openCommentForm}
          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 500, color: C.accent, background: C.accentBg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 9px', cursor: 'pointer' }}
        >
          + Kommenter her
        </button>
      </div>

      {addingAt !== null && (
        <div style={{ marginTop: 8, padding: '8px 10px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8 }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, margin: '0 0 6px' }}>
            Ved {formatTs(addingAt)}
          </p>
          <textarea
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            placeholder="Skriv kommentar..."
            rows={2}
            autoFocus
            style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 8px', outline: 'none', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button
              onClick={submitComment}
              disabled={!commentText.trim() || saving}
              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600, padding: '5px 10px', borderRadius: 6, border: 'none', background: C.accent, color: '#fff', cursor: commentText.trim() ? 'pointer' : 'default', opacity: commentText.trim() ? 1 : 0.5 }}
            >
              {saving ? 'Lagrer...' : 'Legg til'}
            </button>
            <button
              onClick={() => setAddingAt(null)}
              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'none', color: C.text3, cursor: 'pointer' }}
            >
              Avbryt
            </button>
          </div>
        </div>
      )}

      {comments.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {comments.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', borderTop: `1px solid ${C.border}`, opacity: c.resolved ? 0.5 : 1 }}>
              {c.timestamp_seconds !== null && (
                <button
                  onClick={() => jumpTo(c.timestamp_seconds)}
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.66rem', fontWeight: 700, color: '#C49434', background: 'rgba(196,148,52,0.1)', border: 'none', borderRadius: 4, padding: '2px 7px', cursor: 'pointer', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatTs(c.timestamp_seconds)}
                </button>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text, margin: 0 }}>{c.text}</p>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.66rem', color: C.text3, margin: '2px 0 0' }}>{c.author?.name ?? c.author?.email ?? 'Ukjent'}</p>
              </div>
              <button
                onClick={() => toggleResolved(c)}
                title={c.resolved ? 'Merk som uløst' : 'Merk som løst'}
                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.66rem', color: c.resolved ? C.success : C.text3, background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 7px', cursor: 'pointer', flexShrink: 0 }}
              >
                {c.resolved ? '✓' : '○'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
