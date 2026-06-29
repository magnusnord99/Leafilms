'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import { C } from '@/lib/admin-theme'
import type { VideoReview, VideoComment } from '@/lib/actions/video-reviews'
import {
  createVideoReview,
  getAdminVideoComments,
  deleteVideoReview,
  resolveVideoComment,
  deleteVideoComment,
} from '@/lib/actions/video-reviews'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTs(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const statusMap: Record<string, { label: string; color: string; bg: string }> = {
  open:      { label: 'Åpen',     color: '#4CAF7D', bg: 'rgba(76,175,125,0.1)' },
  submitted: { label: 'Innsendt', color: C.accent,  bg: C.accentBg },
}

// ─── Share link box ───────────────────────────────────────────────────────────
function VideoLinkBox({ token, pinCode }: { token: string; pinCode: string }) {
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedPin, setCopiedPin]   = useState(false)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const url = `${origin}/v/${token}`

  function copy(text: string, set: (v: boolean) => void) {
    navigator.clipboard.writeText(text)
    set(true)
    setTimeout(() => set(false), 2000)
  }

  const btnStyle: React.CSSProperties = {
    padding: '4px 9px', borderRadius: 5,
    border: `1px solid ${C.border}`,
    background: 'none', color: C.text2,
    fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', cursor: 'pointer',
  }

  return (
    <div style={{
      background: C.bg, border: `1px solid ${C.border}`,
      borderRadius: 7, padding: '8px 10px',
    }}>
      <div style={{
        fontFamily: 'monospace', fontSize: '0.65rem', color: C.accent,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3,
      }}>
        {url}
      </div>
      <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text2 }}>
        PIN: <strong style={{ color: C.text, letterSpacing: '0.1em' }}>{pinCode}</strong>
      </div>
      <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
        <button onClick={() => copy(url, setCopiedLink)} style={btnStyle}>
          {copiedLink ? '✓' : 'Kopier lenke'}
        </button>
        <button onClick={() => copy(pinCode, setCopiedPin)} style={btnStyle}>
          {copiedPin ? '✓' : 'Kopier PIN'}
        </button>
      </div>
    </div>
  )
}

// ─── Comment row ──────────────────────────────────────────────────────────────
function CommentRow({
  comment,
  onResolve,
  onDelete,
}: {
  comment: VideoComment
  onResolve: (id: string, resolved: boolean) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [resolving, setResolving] = useState(false)
  const [deleting, setDeleting]   = useState(false)

  async function handleResolve() {
    setResolving(true)
    await onResolve(comment.id, !comment.resolved)
    setResolving(false)
  }

  async function handleDelete() {
    if (!confirm('Slett denne kommentaren?')) return
    setDeleting(true)
    await onDelete(comment.id)
    setDeleting(false)
  }

  return (
    <div style={{
      padding: '10px 14px',
      borderBottom: `1px solid ${C.surface2}`,
      opacity: comment.resolved ? 0.45 : 1,
      transition: 'opacity 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* Timestamp */}
        {comment.timestamp_seconds !== null && (
          <span style={{
            flexShrink: 0,
            marginTop: 2,
            padding: '2px 7px',
            borderRadius: 4,
            background: 'rgba(196,148,52,0.1)',
            color: '#C49434',
            fontSize: '0.65rem',
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            fontFamily: 'var(--font-dm-sans)',
          }}>
            {formatTs(comment.timestamp_seconds)}
          </span>
        )}

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem',
            color: C.text, lineHeight: 1.5, margin: 0,
            textDecoration: comment.resolved ? 'line-through' : 'none',
          }}>
            {comment.text}
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
            {comment.author_name && (
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>
                {comment.author_name}
              </span>
            )}
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>
              {new Date(comment.created_at).toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          <button
            onClick={handleResolve}
            disabled={resolving}
            title={comment.resolved ? 'Marker som uløst' : 'Marker som løst'}
            style={{
              padding: '3px 8px', borderRadius: 5,
              border: `1px solid ${comment.resolved ? C.border : 'rgba(76,175,125,0.35)'}`,
              background: 'none',
              color: comment.resolved ? C.text3 : '#4CAF7D',
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', cursor: 'pointer',
              opacity: resolving ? 0.5 : 1,
            }}
          >
            {comment.resolved ? 'Gjenåpne' : 'Løst'}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Slett kommentar"
            style={{
              width: 24, height: 24, borderRadius: 5,
              border: `1px solid rgba(180,60,60,0.3)`,
              background: 'none', color: C.danger,
              fontSize: '0.85rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: deleting ? 0.5 : 1,
            }}
          >
            ×
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Review card ──────────────────────────────────────────────────────────────
function ReviewCard({
  review,
  expanded,
  comments,
  loadingComments,
  onToggle,
  onDelete,
  onResolveComment,
  onDeleteComment,
}: {
  review: VideoReview
  expanded: boolean
  comments: VideoComment[] | null
  loadingComments: boolean
  onToggle: () => void
  onDelete: () => void
  onResolveComment: (id: string, resolved: boolean) => Promise<void>
  onDeleteComment: (id: string) => Promise<void>
}) {
  const [deleting, setDeleting] = useState(false)
  const status = statusMap[review.status] ?? statusMap.open

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`Slett "${review.title}"? Videofilen og alle kommentarer slettes permanent.`)) return
    setDeleting(true)
    await onDelete()
    setDeleting(false)
  }

  // Sort comments by timestamp asc, null last
  const sorted = comments
    ? [...comments].sort((a, b) => (a.timestamp_seconds ?? Infinity) - (b.timestamp_seconds ?? Infinity))
    : []

  return (
    <div style={{
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      overflow: 'hidden',
      background: C.surface,
      marginBottom: 12,
    }}>
      {/* Card header — always visible */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', cursor: 'pointer',
          borderBottom: expanded ? `1px solid ${C.border}` : 'none',
          transition: 'background 0.12s',
        }}
        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = C.surface2}
        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
      >
        {/* Expand arrow */}
        <span style={{
          color: C.text3, fontSize: '0.75rem',
          transform: expanded ? 'rotate(90deg)' : 'none',
          transition: 'transform 0.15s',
          display: 'inline-block',
        }}>
          ›
        </span>

        {/* Title */}
        <span style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: '0.88rem',
          fontWeight: 600, color: C.text, flex: 1,
        }}>
          {review.title}
        </span>

        {/* Status badge */}
        <span style={{
          padding: '2px 9px', borderRadius: 10,
          fontSize: '0.65rem', fontWeight: 700,
          fontFamily: 'var(--font-dm-sans)',
          color: status.color, background: status.bg,
        }}>
          {status.label}
        </span>

        {/* Date */}
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>
          {new Date(review.created_at).toLocaleDateString('nb-NO')}
        </span>

        {/* Delete */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          title="Slett videogjennomgang"
          style={{
            padding: '5px 10px', borderRadius: 6,
            border: `1px solid rgba(180,60,60,0.35)`,
            background: 'none', color: C.danger,
            fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', cursor: 'pointer',
            opacity: deleting ? 0.5 : 1,
          }}
        >
          {deleting ? '...' : 'Slett'}
        </button>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: '14px 16px' }}>
          {/* Share link */}
          <div style={{ marginBottom: 16 }}>
            <div style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              color: C.text3, marginBottom: 6,
            }}>
              Delelenke
            </div>
            <VideoLinkBox token={review.token} pinCode={review.pin_code} />
          </div>

          {/* Comments */}
          <div style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            color: C.text3, marginBottom: 8,
          }}>
            Kommentarer
            {sorted.length > 0 && (
              <span style={{ marginLeft: 6, color: C.text2, textTransform: 'none', letterSpacing: 0 }}>
                ({sorted.length})
              </span>
            )}
          </div>

          {loadingComments ? (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, padding: '12px 0' }}>
              Laster kommentarer...
            </p>
          ) : sorted.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, padding: '12px 0' }}>
              Ingen kommentarer enda.
            </p>
          ) : (
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
              {sorted.map(c => (
                <CommentRow
                  key={c.id}
                  comment={c}
                  onResolve={onResolveComment}
                  onDelete={onDeleteComment}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function VideoAdminClient({
  projectId,
  projectName,
  initialReviews,
}: {
  projectId: string
  projectName: string
  initialReviews: VideoReview[]
}) {
  const router = useRouter()

  const [reviews, setReviews] = useState<VideoReview[]>(initialReviews)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [commentsByReview, setCommentsByReview] = useState<Record<string, VideoComment[]>>({})
  const [loadingCommentsFor, setLoadingCommentsFor] = useState<string | null>(null)

  // Upload form
  const [newTitle, setNewTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Toggle review expansion ───────────────────────────────────────────────
  async function toggleExpand(reviewId: string) {
    if (expandedId === reviewId) {
      setExpandedId(null)
      return
    }
    setExpandedId(reviewId)
    if (!commentsByReview[reviewId]) {
      setLoadingCommentsFor(reviewId)
      const comments = await getAdminVideoComments(reviewId)
      setCommentsByReview(prev => ({ ...prev, [reviewId]: comments }))
      setLoadingCommentsFor(null)
    }
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  function handleFileSelect(f: File) {
    if (!f.type.startsWith('video/')) return
    setFile(f)
    setUploadError(null)
    if (!newTitle.trim()) {
      // Pre-fill title from filename (strip extension)
      setNewTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '))
    }
  }

  async function handleUpload() {
    if (!file || !newTitle.trim()) return
    setUploading(true)
    setUploadError(null)
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${projectId}/${Date.now()}_${safeName}`
      const { error: uploadErr } = await supabase.storage
        .from('videos')
        .upload(path, file, { contentType: file.type, upsert: false })
      if (uploadErr) throw uploadErr
      const review = await createVideoReview(projectId, newTitle.trim(), path)
      setReviews(prev => [review, ...prev])
      setNewTitle('')
      setFile(null)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Opplasting feilet')
    } finally {
      setUploading(false)
    }
  }

  // ── Delete review ─────────────────────────────────────────────────────────
  async function handleDeleteReview(review: VideoReview) {
    await deleteVideoReview(review.id, review.storage_path)
    setReviews(prev => prev.filter(r => r.id !== review.id))
    if (expandedId === review.id) setExpandedId(null)
  }

  // ── Resolve / delete comment ──────────────────────────────────────────────
  async function handleResolveComment(reviewId: string, commentId: string, resolved: boolean) {
    await resolveVideoComment(commentId, resolved)
    setCommentsByReview(prev => ({
      ...prev,
      [reviewId]: (prev[reviewId] ?? []).map(c =>
        c.id === commentId ? { ...c, resolved } : c
      ),
    }))
  }

  async function handleDeleteComment(reviewId: string, commentId: string) {
    await deleteVideoComment(commentId)
    setCommentsByReview(prev => ({
      ...prev,
      [reviewId]: (prev[reviewId] ?? []).filter(c => c.id !== commentId),
    }))
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem',
    textTransform: 'uppercase', letterSpacing: '0.08em',
    color: C.text3, marginBottom: 6,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '9px 12px', borderRadius: 7,
    border: `1px solid ${C.border}`,
    background: C.surface2, color: C.text,
    fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem',
    outline: 'none',
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      {/* Topbar */}
      <div style={{
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
        padding: '12px 20px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button
          onClick={() => router.push(`/admin/projects/${projectId}`)}
          style={{
            background: 'none', border: 'none',
            color: C.text3, cursor: 'pointer',
            fontSize: '0.78rem', fontFamily: 'var(--font-dm-sans)',
          }}
        >
          ← {projectName}
        </button>
        <span style={{ color: C.text3 }}>/</span>
        <span style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem',
          fontWeight: 600, color: C.text,
        }}>
          Videogjennomgang
        </span>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 20px' }}>

        {/* ── Upload section ──────────────────────────────────────────────── */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: '20px 22px', marginBottom: 28,
        }}>
          <p style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem',
            fontWeight: 700, color: C.text, marginBottom: 16,
          }}>
            Last opp ny video
          </p>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Tittel</label>
            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="f.eks. Bryllup Hansen — klipp 1"
              style={inputStyle}
            />
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
              e.preventDefault()
              setDragging(false)
              const f = e.dataTransfer.files[0]
              if (f) handleFileSelect(f)
            }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? C.accent : file ? '#4CAF7D' : C.border}`,
              borderRadius: 8,
              padding: '24px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragging ? C.accentBg : 'transparent',
              transition: 'border-color 0.15s, background 0.15s',
              marginBottom: 14,
            }}
          >
            {file ? (
              <div>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: '#4CAF7D', margin: 0 }}>
                  {file.name}
                </p>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginTop: 3 }}>
                  {(file.size / 1024 / 1024).toFixed(1)} MB — klikk for å bytte
                </p>
              </div>
            ) : (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text3, margin: 0 }}>
                Dra og slipp video her, eller klikk for å velge
              </p>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]) }}
          />

          {uploadError && (
            <p style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem',
              color: C.danger, marginBottom: 10,
            }}>
              {uploadError}
            </p>
          )}

          <button
            onClick={handleUpload}
            disabled={!file || !newTitle.trim() || uploading}
            style={{
              padding: '9px 20px', borderRadius: 7, border: 'none',
              background: file && newTitle.trim() && !uploading ? C.accent : C.surface2,
              color: file && newTitle.trim() && !uploading ? '#fff' : C.text3,
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem',
              fontWeight: 600, cursor: file && newTitle.trim() && !uploading ? 'pointer' : 'default',
              transition: 'background 0.15s',
            }}
          >
            {uploading ? 'Laster opp...' : 'Last opp og opprett gjennomgang'}
          </button>

          {uploading && (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, marginTop: 8 }}>
              Laster opp video — dette kan ta litt tid for store filer...
            </p>
          )}
        </div>

        {/* ── Review list ─────────────────────────────────────────────────── */}
        <div style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem',
          textTransform: 'uppercase', letterSpacing: '0.08em',
          color: C.text3, marginBottom: 12,
        }}>
          Gjennomganger ({reviews.length})
        </div>

        {reviews.length === 0 ? (
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: '32px',
            textAlign: 'center',
          }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text3 }}>
              Ingen videogjennomganger enda. Last opp den første ovenfor.
            </p>
          </div>
        ) : (
          reviews.map(review => (
            <ReviewCard
              key={review.id}
              review={review}
              expanded={expandedId === review.id}
              comments={commentsByReview[review.id] ?? null}
              loadingComments={loadingCommentsFor === review.id}
              onToggle={() => toggleExpand(review.id)}
              onDelete={() => handleDeleteReview(review)}
              onResolveComment={(commentId, resolved) =>
                handleResolveComment(review.id, commentId, resolved)
              }
              onDeleteComment={commentId => handleDeleteComment(review.id, commentId)}
            />
          ))
        )}
      </div>
    </div>
  )
}
