'use client'

import { useEffect, useRef, useState } from 'react'
import {
  getTaskVideoFileSignedUrl, getTaskFileComments, addTaskFileComment, resolveTaskFileComment,
  getLatestTaskFileReview, respondToTaskFileReview,
} from '@/lib/actions/task-video-files'
import type { TaskFileComment, TaskFileReview } from '@/lib/actions/task-video-files'
import { C } from '@/lib/admin-theme'

// Samme layout/interaksjonsmønster som kunde-video-reviewen (app/v/[token]/
// VideoReviewClient.tsx) — scrubber med kommentarmarkører, hover-
// forhåndsvisning, sidepanel — men med admin-appens eget fargetema (C) i
// stedet for galleriets kinematiske gull/mørke-palett, siden dette er en
// intern visning og skal se ut som resten av verktøyet (inkl. lys/mørk
// modus), ikke som kunde-siden. Presisert av Magnus 2026-09-21.
const S = {
  bg:      C.bg,
  surface: C.surface,
  surface2:C.surface2,
  border:  C.border,
  accent:  C.accent,
  text:    C.text,
  text2:   C.text2,
  text3:   C.text3,
}

function formatTs(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function IconPlay() {
  return (
    <svg width="11" height="13" viewBox="0 0 11 13" fill={S.text}>
      <polygon points="0,0 11,6.5 0,13" />
    </svg>
  )
}

function IconPause() {
  return (
    <svg width="11" height="13" viewBox="0 0 11 13" fill={S.text}>
      <rect x="0" y="0" width="4" height="13" rx="1" />
      <rect x="7" y="0" width="4" height="13" rx="1" />
    </svg>
  )
}

function IconVolume({ muted }: { muted: boolean }) {
  return muted ? (
    <svg width="14" height="12" viewBox="0 0 14 12" fill="none">
      <polygon points="0,3 4,3 8,0 8,12 4,9 0,9" fill={S.text3} />
      <line x1="11" y1="2" x2="14" y2="10" stroke={S.text3} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="14" y1="2" x2="11" y2="10" stroke={S.text3} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ) : (
    <svg width="14" height="12" viewBox="0 0 14 12" fill="none">
      <polygon points="0,3 4,3 8,0 8,12 4,9 0,9" fill={S.text} />
      <path d="M10 2.5 C11.8 4 11.8 8 10 9.5" stroke={S.text} strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <path d="M12 0.5 C14.5 3 14.5 9 12 11.5" stroke={S.text2} strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1 1L13 13M13 1L1 13" stroke={S.text} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function TaskFileReviewOverlay({
  fileId, filename, currentUserId, onClose,
}: {
  fileId: string
  filename: string
  currentUserId: string | null
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const progressBarRef = useRef<HTMLDivElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)

  const [url, setUrl] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)

  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted, setMuted] = useState(false)
  const [scrubbing, setScrubbing] = useState(false)
  const [previewRatio, setPreviewRatio] = useState<number | null>(null)
  const wasPlayingRef = useRef(false)

  const [comments, setComments] = useState<TaskFileComment[]>([])
  const [showCommentForm, setShowCommentForm] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [commentTimestamp, setCommentTimestamp] = useState(0)
  const [addingComment, setAddingComment] = useState(false)

  const [colleagueReview, setColleagueReview] = useState<TaskFileReview | null>(null)
  const [respondComment, setRespondComment] = useState('')
  const [responding, setResponding] = useState<'approved' | 'changes_requested' | null>(null)

  const sortedComments = [...comments].sort((a, b) => {
    const ta = a.timestamp_seconds ?? Infinity
    const tb = b.timestamp_seconds ?? Infinity
    return ta - tb
  })

  useEffect(() => {
    let cancelled = false
    getTaskVideoFileSignedUrl(fileId).then(u => {
      if (cancelled) return
      if (u) setUrl(u)
      else setLoadError(true)
    })
    getTaskFileComments(fileId).then(c => { if (!cancelled) setComments(c) })
    getLatestTaskFileReview(fileId).then(r => { if (!cancelled) setColleagueReview(r) })
    return () => { cancelled = true }
  }, [fileId])

  useEffect(() => {
    const vid = videoRef.current
    if (!vid) return
    const onTime = () => setCurrentTime(vid.currentTime)
    const onDur = () => setDuration(vid.duration)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    vid.addEventListener('timeupdate', onTime)
    vid.addEventListener('durationchange', onDur)
    vid.addEventListener('loadedmetadata', onDur)
    vid.addEventListener('play', onPlay)
    vid.addEventListener('pause', onPause)
    return () => {
      vid.removeEventListener('timeupdate', onTime)
      vid.removeEventListener('durationchange', onDur)
      vid.removeEventListener('loadedmetadata', onDur)
      vid.removeEventListener('play', onPlay)
      vid.removeEventListener('pause', onPause)
    }
  }, [url])

  function togglePlay() {
    const vid = videoRef.current
    if (!vid) return
    if (vid.paused) vid.play()
    else vid.pause()
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { if (!showCommentForm) onClose(); else setShowCommentForm(false); return }
      if (e.code !== 'Space') return
      if (showCommentForm) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || (e.target as HTMLElement | null)?.isContentEditable) return
      e.preventDefault()
      togglePlay()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showCommentForm, onClose])

  function drawPreviewFrame(vid: HTMLVideoElement, canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx || !vid.videoWidth || !vid.videoHeight) return
    canvas.width = 160
    canvas.height = Math.round(160 * (vid.videoHeight / vid.videoWidth))
    ctx.drawImage(vid, 0, 0, canvas.width, canvas.height)
  }

  useEffect(() => {
    const vid = videoRef.current
    const canvas = previewCanvasRef.current
    if (!vid || !canvas) return
    function onSeeked() {
      if (!scrubbing || !vid || !canvas) return
      drawPreviewFrame(vid, canvas)
    }
    vid.addEventListener('seeked', onSeeked)
    return () => vid.removeEventListener('seeked', onSeeked)
    // `url` må med her — video-elementene rendres først når den signerte URL-en
    // er hentet (async), så uten `url` i avhengighetslisten kjører denne
    // effekten ferdig med tomme refs FØR <video>-taggene i det hele tatt
    // finnes i DOM-en, og fanger dermed aldri opp de faktiske elementene.
  }, [scrubbing, url])

  useEffect(() => {
    const vid = previewVideoRef.current
    const canvas = previewCanvasRef.current
    if (!vid || !canvas) return
    function onSeeked() {
      if (scrubbing || !vid || !canvas) return
      drawPreviewFrame(vid, canvas)
    }
    vid.addEventListener('seeked', onSeeked)
    return () => vid.removeEventListener('seeked', onSeeked)
  }, [scrubbing, url])

  function toggleMute() {
    const vid = videoRef.current
    if (!vid) return
    vid.muted = !vid.muted
    setMuted(vid.muted)
  }

  function ratioFromPointer(clientX: number): number {
    const bar = progressBarRef.current
    if (!bar) return 0
    const rect = bar.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }

  function seekToRatio(ratio: number) {
    const vid = videoRef.current
    if (!vid || !duration) return
    const time = ratio * duration
    vid.currentTime = time
    setCurrentTime(time)
  }

  function seekPreviewToRatio(ratio: number) {
    const vid = previewVideoRef.current
    if (!vid || !duration) return
    vid.currentTime = ratio * duration
  }

  function handleProgressPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const vid = videoRef.current
    if (!vid || !duration) return
    e.currentTarget.setPointerCapture(e.pointerId)
    wasPlayingRef.current = playing
    vid.pause()
    setScrubbing(true)
    const ratio = ratioFromPointer(e.clientX)
    setPreviewRatio(ratio)
    seekToRatio(ratio)
  }

  function handleProgressPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const ratio = ratioFromPointer(e.clientX)
    if (scrubbing) {
      setPreviewRatio(ratio)
      seekToRatio(ratio)
    } else if (e.pointerType === 'mouse' && duration > 0) {
      setPreviewRatio(ratio)
      seekPreviewToRatio(ratio)
    }
  }

  function handleProgressPointerLeave() {
    if (!scrubbing) setPreviewRatio(null)
  }

  function handleProgressPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!scrubbing) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    setScrubbing(false)
    setPreviewRatio(null)
    if (wasPlayingRef.current) videoRef.current?.play()
  }

  function jumpToComment(secs: number | null) {
    const vid = videoRef.current
    if (!vid || secs === null) return
    vid.currentTime = secs
    vid.play()
  }

  function openCommentForm() {
    const vid = videoRef.current
    if (!vid) return
    vid.pause()
    setCommentTimestamp(vid.currentTime)
    setCommentText('')
    setShowCommentForm(true)
  }

  async function handleAddComment() {
    if (!commentText.trim()) return
    setAddingComment(true)
    try {
      const result = await addTaskFileComment(fileId, commentText.trim(), Math.floor(commentTimestamp))
      if ('error' in result) { alert(result.error); return }
      setComments(prev => [...prev, result.comment])
      setShowCommentForm(false)
    } finally {
      setAddingComment(false)
    }
  }

  async function toggleResolved(comment: TaskFileComment) {
    setComments(prev => prev.map(c => c.id === comment.id ? { ...c, resolved: !c.resolved } : c))
    await resolveTaskFileComment(comment.id, !comment.resolved)
  }

  async function handleRespond(decision: 'approved' | 'changes_requested') {
    if (!colleagueReview) return
    if (decision === 'changes_requested' && !respondComment.trim()) {
      alert('Skriv en kommentar før du ber om endringer')
      return
    }
    setResponding(decision)
    const result = await respondToTaskFileReview(colleagueReview.id, decision, respondComment)
    setResponding(null)
    if (!result.ok) { alert(result.error ?? 'Noe gikk galt'); return }
    setColleagueReview(await getLatestTaskFileReview(fileId))
    setRespondComment('')
  }

  const isAssignedReviewer = !!currentUserId && colleagueReview?.reviewer_id === currentUserId && colleagueReview.status === 'pending'
  const progressRatio = duration > 0 ? currentTime / duration : 0

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      background: S.bg,
      fontFamily: 'var(--font-dm-sans, sans-serif)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        background: S.surface,
        borderBottom: `1px solid ${S.border}`,
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '0.88rem', fontWeight: 600, color: S.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {filename}
        </span>
        <button
          onClick={onClose}
          style={{
            width: 30, height: 30, borderRadius: '50%',
            border: `1px solid ${S.border}`, background: S.surface2,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <IconClose />
        </button>
      </div>

      {/* Body: video + sidebar */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 320px', minHeight: 0 }}>
        <div style={{
          background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 0, cursor: url ? 'pointer' : 'default', overflow: 'hidden',
        }} onClick={url ? togglePlay : undefined}>
          {loadError && (
            <p style={{ color: S.text3, fontSize: '0.85rem' }}>Kunne ikke laste videoen</p>
          )}
          {!loadError && !url && (
            <p style={{ color: S.text3, fontSize: '0.85rem' }}>Laster...</p>
          )}
          {url && (
            <>
              <video ref={videoRef} src={url} style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }} />
              <video
                ref={previewVideoRef}
                src={url}
                muted
                playsInline
                preload="metadata"
                style={{ position: 'fixed', top: -9999, left: -9999, width: 160, height: 90, opacity: 0, pointerEvents: 'none' }}
              />
            </>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ borderLeft: `1px solid ${S.border}`, background: S.surface, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '13px 16px 10px', borderBottom: `1px solid ${S.border}`, flexShrink: 0 }}>
            <span style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: S.text3, fontWeight: 700 }}>
              Kommentarer
            </span>
            {comments.length > 0 && (
              <span style={{ marginLeft: 8, fontSize: '0.62rem', color: S.text3 }}>({comments.length})</span>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {sortedComments.length === 0 && (
              <p style={{ padding: '28px 16px', fontSize: '0.78rem', color: S.text3, textAlign: 'center', lineHeight: 1.6 }}>
                Ingen kommentarer enda.
                <br />
                Pause videoen og legg til en.
              </p>
            )}
            {sortedComments.map(c => (
              <div
                key={c.id}
                style={{
                  padding: '10px 16px', borderBottom: `1px solid ${S.border}`,
                  opacity: c.resolved ? 0.5 : 1,
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = S.surface2 }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  {c.timestamp_seconds !== null && (
                    <span
                      onClick={() => jumpToComment(c.timestamp_seconds)}
                      style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                        background: C.accentBg, color: S.accent,
                        fontSize: '0.66rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                        letterSpacing: '0.04em', cursor: 'pointer',
                      }}
                    >
                      {formatTs(c.timestamp_seconds)}
                    </span>
                  )}
                  <div style={{ flex: 1 }} />
                  <button
                    onClick={() => toggleResolved(c)}
                    title={c.resolved ? 'Merk som uløst' : 'Merk som løst'}
                    style={{
                      fontSize: '0.62rem', color: c.resolved ? C.success : S.text3,
                      background: 'none', border: `1px solid ${S.border}`, borderRadius: 4,
                      padding: '1px 6px', cursor: 'pointer',
                    }}
                  >
                    {c.resolved ? '✓' : '○'}
                  </button>
                </div>
                <p style={{ fontSize: '0.82rem', color: S.text, lineHeight: 1.55, margin: 0 }}>
                  {c.text}
                </p>
                <p style={{ fontSize: '0.68rem', color: S.text3, marginTop: 3 }}>
                  — {c.author?.name ?? c.author?.email ?? 'Ukjent'}
                </p>
              </div>
            ))}
          </div>

          {/* Godkjenn/Be om endringer — kun for den tildelte revieweren */}
          {isAssignedReviewer && (
            <div style={{ padding: '12px 14px', borderTop: `1px solid ${S.border}`, flexShrink: 0 }}>
              <p style={{ fontSize: '0.7rem', color: S.text3, marginBottom: 8 }}>
                Du er satt som reviewer for denne filen
              </p>
              <textarea
                value={respondComment}
                onChange={e => setRespondComment(e.target.value)}
                placeholder="Kommentar (påkrevd hvis du ber om endringer)"
                rows={2}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8,
                  border: `1px solid ${S.border}`, background: S.surface2, color: S.text,
                  fontSize: '0.8rem', fontFamily: 'inherit', resize: 'vertical', outline: 'none', marginBottom: 8,
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => handleRespond('changes_requested')}
                  disabled={responding !== null}
                  style={{
                    flex: 1, padding: '9px', borderRadius: 8, border: `1px solid ${S.border}`,
                    background: 'none', color: C.danger, fontSize: '0.78rem', fontWeight: 600,
                    cursor: responding ? 'default' : 'pointer',
                  }}
                >
                  {responding === 'changes_requested' ? 'Sender...' : 'Be om endringer'}
                </button>
                <button
                  onClick={() => handleRespond('approved')}
                  disabled={responding !== null}
                  style={{
                    flex: 1, padding: '9px', borderRadius: 8, border: 'none',
                    background: S.accent, color: '#fff', fontSize: '0.78rem', fontWeight: 700,
                    cursor: responding ? 'default' : 'pointer',
                  }}
                >
                  {responding === 'approved' ? 'Sender...' : 'Godkjenn'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Controls bar */}
      {url && (
        <div style={{ background: S.surface, borderTop: `1px solid ${S.border}`, padding: '10px 16px 12px', flexShrink: 0 }}>
          <div
            onPointerDown={handleProgressPointerDown}
            onPointerMove={handleProgressPointerMove}
            onPointerUp={handleProgressPointerUp}
            onPointerCancel={handleProgressPointerUp}
            onPointerLeave={handleProgressPointerLeave}
            style={{ position: 'relative', padding: '8px 0', margin: '-8px 0 2px', cursor: 'pointer', touchAction: 'none' }}
          >
            {previewRatio !== null && (
              <div style={{
                position: 'absolute', bottom: '100%', left: `${previewRatio * 100}%`,
                transform: 'translateX(-50%)', marginBottom: 10, pointerEvents: 'none', zIndex: 3,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <canvas
                  ref={previewCanvasRef}
                  style={{ display: 'block', width: 140, height: 'auto', borderRadius: 6, border: `1px solid ${S.border}`, background: '#000', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}
                />
                <span style={{ padding: '2px 7px', borderRadius: 4, background: S.surface, border: `1px solid ${S.border}`, color: S.text, fontSize: '0.68rem', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {formatTs(previewRatio * duration)}
                </span>
              </div>
            )}
            <div ref={progressBarRef} style={{ position: 'relative', height: 4, background: S.surface2, borderRadius: 2, pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progressRatio * 100}%`, background: S.accent, borderRadius: 2, pointerEvents: 'none' }} />
              {duration > 0 && sortedComments
                .filter(c => c.timestamp_seconds !== null)
                .map(c => (
                  <div
                    key={c.id}
                    style={{
                      position: 'absolute', top: '50%', left: `${((c.timestamp_seconds ?? 0) / duration) * 100}%`,
                      transform: 'translate(-50%, -50%)', width: 8, height: 8, borderRadius: '50%',
                      background: S.accent, border: `2px solid ${S.bg}`, pointerEvents: 'none', zIndex: 1,
                    }}
                  />
                ))}
              <div style={{
                position: 'absolute', top: '50%', left: `${progressRatio * 100}%`,
                transform: `translate(-50%, -50%) scale(${scrubbing ? 1.3 : 1})`,
                width: 13, height: 13, borderRadius: '50%', background: S.text, border: `2px solid ${S.accent}`,
                pointerEvents: 'none', zIndex: 2, transition: 'transform 0.1s',
              }} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={togglePlay}
              style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: S.surface2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              {playing ? <IconPause /> : <IconPlay />}
            </button>

            <span style={{ fontSize: '0.78rem', color: S.text2, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {formatTs(currentTime)} / {formatTs(duration)}
            </span>

            <div style={{ flex: 1 }} />

            <button
              onClick={openCommentForm}
              style={{ padding: '7px 14px', borderRadius: 7, border: `1px solid ${S.border}`, background: 'none', color: S.text2, fontSize: '0.78rem', cursor: 'pointer' }}
            >
              + Legg til kommentar
            </button>

            <button
              onClick={toggleMute}
              style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: S.surface2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              <IconVolume muted={muted} />
            </button>
          </div>
        </div>
      )}

      {/* Add comment modal */}
      {showCommentForm && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,9,8,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 210, padding: 24 }}
          onClick={() => setShowCommentForm(false)}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 12, padding: 24, width: '100%', maxWidth: 440 }}>
            <div style={{ marginBottom: 14 }}>
              <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 5, background: C.accentBg, color: S.accent, fontSize: '0.78rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em' }}>
                @ {formatTs(commentTimestamp)}
              </span>
            </div>
            <textarea
              autoFocus
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddComment()
                if (e.key === 'Escape') setShowCommentForm(false)
              }}
              placeholder="Skriv kommentar..."
              rows={3}
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: `1px solid ${S.border}`, background: S.surface2, color: S.text, fontSize: '1rem', fontFamily: 'inherit', resize: 'vertical', outline: 'none', marginBottom: 16, display: 'block' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCommentForm(false)}
                style={{ padding: '9px 16px', borderRadius: 7, border: `1px solid ${S.border}`, background: 'none', color: S.text2, fontSize: '0.82rem', cursor: 'pointer' }}
              >
                Avbryt
              </button>
              <button
                onClick={handleAddComment}
                disabled={!commentText.trim() || addingComment}
                style={{
                  padding: '9px 20px', borderRadius: 7, border: 'none',
                  background: commentText.trim() && !addingComment ? S.accent : S.surface2,
                  color: commentText.trim() && !addingComment ? '#fff' : S.text3,
                  fontSize: '0.82rem', fontWeight: 700, cursor: commentText.trim() && !addingComment ? 'pointer' : 'default',
                }}
              >
                {addingComment ? 'Sender...' : 'Legg til'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
