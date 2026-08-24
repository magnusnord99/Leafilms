'use client'

import { useState, useRef, useEffect } from 'react'
import type { VideoReview, VideoComment } from '@/lib/actions/video-reviews'
import {
  addVideoComment,
  submitVideoReview,
  addVideoCommentViaGallery,
  submitVideoReviewViaGallery,
} from '@/lib/actions/video-reviews'

const S = {
  bg:      '#0C0B09',
  surface: '#131210',
  surface2:'#1A1916',
  border:  '#2A2820',
  gold:    '#C49434',
  text:    '#E8E0D0',
  text2:   '#8A8070',
  text3:   '#5A5448',
}

function formatTs(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// ─── Play icon ───────────────────────────────────────────────────────────────
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


const VR_STRINGS = {
  no: {
    gallery: 'Galleri',
    submittedBadge: 'Innsendt',
    comments: 'Kommentarer',
    noCommentsLine1: 'Ingen kommentarer enda.',
    noCommentsLine2: 'Pause videoen og legg til en.',
    feedbackSent: 'Tilbakemeldingene er sendt til Leafilms',
    submitFeedback: 'Send inn tilbakemeldinger',
    addComment: '+ Legg til kommentar',
    writeComment: 'Skriv kommentar...',
    yourNameOptional: 'Ditt navn (valgfritt)',
    cancel: 'Avbryt',
    sending: 'Sender...',
    add: 'Legg til',
    confirmBody: (n: number) => `Du sender ${n} kommentar${n !== 1 ? 'er' : ''} til Leafilms. Dette kan ikke angres.`,
    confirmAndSend: 'Bekreft og send',
  },
  en: {
    gallery: 'Gallery',
    submittedBadge: 'Submitted',
    comments: 'Comments',
    noCommentsLine1: 'No comments yet.',
    noCommentsLine2: 'Pause the video and add one.',
    feedbackSent: 'Your feedback has been sent to Leafilms',
    submitFeedback: 'Submit feedback',
    addComment: '+ Add comment',
    writeComment: 'Write a comment...',
    yourNameOptional: 'Your name (optional)',
    cancel: 'Cancel',
    sending: 'Sending...',
    add: 'Add',
    confirmBody: (n: number) => `You are sending ${n} comment${n !== 1 ? 's' : ''} to Leafilms. This cannot be undone.`,
    confirmAndSend: 'Confirm and send',
  },
} as const

// ─── Main component ───────────────────────────────────────────────────────────
export default function VideoReviewClient({
  token,
  review,
  comments: initialComments,
  signedUrl,
  galleryMode,
  reviewId,
  language = 'no',
}: {
  token: string
  review: VideoReview
  comments: VideoComment[]
  signedUrl: string
  galleryMode?: boolean
  reviewId?: string
  language?: 'no' | 'en'
}) {
  const t = VR_STRINGS[language]
  const videoRef = useRef<HTMLVideoElement>(null)
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const progressBarRef = useRef<HTMLDivElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)

  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted, setMuted] = useState(false)
  const [scrubbing, setScrubbing] = useState(false)
  const [previewRatio, setPreviewRatio] = useState<number | null>(null)
  const wasPlayingRef = useRef(false)

  const [comments, setComments] = useState<VideoComment[]>(initialComments)
  const [showCommentForm, setShowCommentForm] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [commentAuthor, setCommentAuthor] = useState('')
  const [commentTimestamp, setCommentTimestamp] = useState(0)
  const [addingComment, setAddingComment] = useState(false)

  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(review.status === 'submitted')

  // Sorted: timestamp ascending, null last
  const sortedComments = [...comments].sort((a, b) => {
    const ta = a.timestamp_seconds ?? Infinity
    const tb = b.timestamp_seconds ?? Infinity
    return ta - tb
  })

  // ─── Video event bindings ────────────────────────────────────────────────
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
  }, [])

  // ─── Controls ────────────────────────────────────────────────────────────
  function togglePlay() {
    const vid = videoRef.current
    if (!vid) return
    if (vid.paused) vid.play()
    else vid.pause()
  }

  // Mellomrom spiller/pauser videoen, med mindre fokus er i et tekstfelt eller på en knapp
  // (der mellomrom har sin egen native oppførsel — skriv tegn / trykk knapp).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== 'Space') return
      if (showCommentForm || showSubmitConfirm) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || (e.target as HTMLElement | null)?.isContentEditable) return
      e.preventDefault()
      togglePlay()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showCommentForm, showSubmitConfirm])

  function drawPreviewFrame(vid: HTMLVideoElement, canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx || !vid.videoWidth || !vid.videoHeight) return
    canvas.width = 160
    canvas.height = Math.round(160 * (vid.videoHeight / vid.videoWidth))
    ctx.drawImage(vid, 0, 0, canvas.width, canvas.height)
  }

  // Scrub-forhåndsvisning (dra): tegn hovedvideoens gjeldende bilde til et lite
  // canvas hver gang søket har landet, siden den allerede er sømt dit.
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
  }, [scrubbing])

  // Hover-forhåndsvisning: en skjult andrevideo søker uavhengig av hovedvideoen,
  // slik at man kan se et thumbnail langs tidslinjen uten å forstyrre avspillingen.
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
  }, [scrubbing])

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
      // Ren hover (ingen drag) — forhåndsvis via skjult andrevideo, ikke hovedvideoen
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

  // ─── Comment form ────────────────────────────────────────────────────────
  function openCommentForm() {
    const vid = videoRef.current
    if (!vid) return
    vid.pause()
    setCommentTimestamp(vid.currentTime)
    setCommentText('')
    setCommentAuthor('')
    setShowCommentForm(true)
  }

  async function handleAddComment() {
    if (!commentText.trim()) return
    setAddingComment(true)
    try {
      const newComment = galleryMode && reviewId
        ? await addVideoCommentViaGallery(
            token,
            reviewId,
            commentText.trim(),
            Math.floor(commentTimestamp),
            commentAuthor.trim() || undefined,
          )
        : await addVideoComment(
            token,
            commentText.trim(),
            Math.floor(commentTimestamp),
            commentAuthor.trim() || undefined,
          )
      setComments(prev => [...prev, newComment])
      setShowCommentForm(false)
    } finally {
      setAddingComment(false)
    }
  }

  // ─── Submit ──────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setSubmitting(true)
    try {
      if (galleryMode && reviewId) {
        await submitVideoReviewViaGallery(token, reviewId)
      } else {
        await submitVideoReview(token)
      }
      setSubmitted(true)
      setShowSubmitConfirm(false)
    } finally {
      setSubmitting(false)
    }
  }

  const progressRatio = duration > 0 ? currentTime / duration : 0

  return (
    <>
      {/* Responsive overrides — kun for mobil */}
      <style>{`
        @media (max-width: 768px) {
          .vrc-body { grid-template-columns: 1fr !important; grid-template-rows: 60dvh 1fr !important; }
          .vrc-sidebar { border-left: none !important; border-top: 1px solid ${S.border} !important; }
        }
      `}</style>

      <div style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: S.bg,
        fontFamily: 'var(--font-dm-sans, sans-serif)',
        overflow: 'hidden',
      }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          background: S.surface,
          borderBottom: `1px solid ${S.border}`,
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexShrink: 0,
        }}>
          {galleryMode && (
            <a
              href={`/s/${token}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                color: S.text3,
                textDecoration: 'none',
                fontSize: '0.78rem',
                flexShrink: 0,
                transition: 'color 0.12s',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.color = S.text}
              onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.color = S.text3}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t.gallery}
            </a>
          )}
          <span style={{
            fontFamily: 'Georgia, serif',
            fontSize: '1rem',
            letterSpacing: '0.16em',
            color: S.gold,
            textTransform: 'uppercase',
          }}>
            Leafilms
          </span>
          <span style={{ width: 1, height: 16, background: S.border, flexShrink: 0 }} />
          <span style={{ fontSize: '0.88rem', fontWeight: 600, color: S.text }}>
            {review.title}
          </span>
          {submitted && (
            <span style={{
              marginLeft: 'auto',
              padding: '3px 10px',
              borderRadius: 10,
              background: 'rgba(196,148,52,0.1)',
              border: '1px solid rgba(196,148,52,0.2)',
              color: S.gold,
              fontSize: '0.66rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}>
              {t.submittedBadge}
            </span>
          )}
        </div>

        {/* ── Body: video + sidebar ───────────────────────────────────────── */}
        <div
          className="vrc-body"
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '1fr 320px',
            minHeight: 0,
          }}
        >
          {/* Video */}
          <div style={{
            background: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 0,
            cursor: 'pointer',
            overflow: 'hidden',
          }} onClick={togglePlay}>
            <video
              ref={videoRef}
              src={signedUrl}
              style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }}
            />
            {/* Skjult andrevideo brukt kun til å søke frem hover-thumbnails uten å forstyrre avspillingen */}
            <video
              ref={previewVideoRef}
              src={signedUrl}
              muted
              playsInline
              preload="metadata"
              style={{ position: 'fixed', top: -9999, left: -9999, width: 160, height: 90, opacity: 0, pointerEvents: 'none' }}
            />
          </div>

          {/* Sidebar */}
          <div
            className="vrc-sidebar"
            style={{
              borderLeft: `1px solid ${S.border}`,
              background: S.surface,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            {/* Sidebar header */}
            <div style={{
              padding: '13px 16px 10px',
              borderBottom: `1px solid ${S.border}`,
              flexShrink: 0,
            }}>
              <span style={{
                fontSize: '0.62rem',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: S.text3,
                fontWeight: 700,
              }}>
                {t.comments}
              </span>
              {comments.length > 0 && (
                <span style={{
                  marginLeft: 8,
                  fontSize: '0.62rem',
                  color: S.text3,
                }}>
                  ({comments.length})
                </span>
              )}
            </div>

            {/* Comment list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {sortedComments.length === 0 && (
                <p style={{
                  padding: '28px 16px',
                  fontSize: '0.78rem',
                  color: S.text3,
                  textAlign: 'center',
                  lineHeight: 1.6,
                }}>
                  {t.noCommentsLine1}
                  <br />
                  {t.noCommentsLine2}
                </p>
              )}
              {sortedComments.map(c => (
                <div
                  key={c.id}
                  onClick={() => jumpToComment(c.timestamp_seconds)}
                  style={{
                    padding: '10px 16px',
                    borderBottom: `1px solid ${S.border}`,
                    cursor: c.timestamp_seconds !== null ? 'pointer' : 'default',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => {
                    if (c.timestamp_seconds !== null)
                      (e.currentTarget as HTMLDivElement).style.background = S.surface2
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                  }}
                >
                  {c.timestamp_seconds !== null && (
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: 'rgba(196,148,52,0.1)',
                      color: S.gold,
                      fontSize: '0.66rem',
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      marginBottom: 5,
                      letterSpacing: '0.04em',
                    }}>
                      {formatTs(c.timestamp_seconds)}
                    </span>
                  )}
                  <p style={{
                    fontSize: '0.82rem',
                    color: S.text,
                    lineHeight: 1.55,
                    margin: 0,
                  }}>
                    {c.text}
                  </p>
                  {c.author_name && (
                    <p style={{
                      fontSize: '0.68rem',
                      color: S.text3,
                      marginTop: 3,
                    }}>
                      — {c.author_name}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Submit */}
            <div style={{
              padding: '12px 14px',
              borderTop: `1px solid ${S.border}`,
              flexShrink: 0,
            }}>
              {submitted ? (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'rgba(196,148,52,0.07)',
                  border: '1px solid rgba(196,148,52,0.2)',
                  textAlign: 'center',
                }}>
                  <p style={{ fontSize: '0.78rem', color: S.gold, margin: 0 }}>
                    {t.feedbackSent}
                  </p>
                </div>
              ) : (
                <button
                  onClick={() => setShowSubmitConfirm(true)}
                  style={{
                    width: '100%',
                    padding: '11px',
                    borderRadius: 8,
                    border: 'none',
                    background: S.gold,
                    color: '#0C0B09',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-dm-sans, sans-serif)',
                    letterSpacing: '0.02em',
                  }}
                >
                  {t.submitFeedback}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Controls bar ───────────────────────────────────────────────── */}
        <div style={{
          background: S.surface,
          borderTop: `1px solid ${S.border}`,
          padding: '10px 16px 12px',
          flexShrink: 0,
        }}>
          {/* Progress bar — ytre wrapper gir en større, usynlig dra-/treffsone
              rundt den tynne synlige linjen, uten å endre det visuelle uttrykket */}
          <div
            onPointerDown={handleProgressPointerDown}
            onPointerMove={handleProgressPointerMove}
            onPointerUp={handleProgressPointerUp}
            onPointerCancel={handleProgressPointerUp}
            onPointerLeave={handleProgressPointerLeave}
            style={{
              position: 'relative',
              padding: '8px 0',
              margin: '-8px 0 2px',
              cursor: 'pointer',
              touchAction: 'none',
            }}
          >
          {/* Scrub-/hover-thumbnail */}
          {previewRatio !== null && (
            <div
              style={{
                position: 'absolute',
                bottom: '100%',
                left: `${previewRatio * 100}%`,
                transform: 'translateX(-50%)',
                marginBottom: 10,
                pointerEvents: 'none',
                zIndex: 3,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <canvas
                ref={previewCanvasRef}
                style={{
                  display: 'block',
                  width: 140,
                  height: 'auto',
                  borderRadius: 6,
                  border: `1px solid ${S.border}`,
                  background: '#000',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                }}
              />
              <span style={{
                padding: '2px 7px',
                borderRadius: 4,
                background: S.surface,
                border: `1px solid ${S.border}`,
                color: S.text,
                fontSize: '0.68rem',
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 600,
              }}>
                {formatTs(previewRatio * duration)}
              </span>
            </div>
          )}
          <div
            ref={progressBarRef}
            style={{
              position: 'relative',
              height: 4,
              background: S.surface2,
              borderRadius: 2,
              pointerEvents: 'none',
            }}
          >
            {/* Fill */}
            <div style={{
              position: 'absolute',
              left: 0, top: 0, bottom: 0,
              width: `${progressRatio * 100}%`,
              background: S.gold,
              borderRadius: 2,
              pointerEvents: 'none',
            }} />

            {/* Comment markers */}
            {duration > 0 && sortedComments
              .filter(c => c.timestamp_seconds !== null)
              .map(c => (
                <div
                  key={c.id}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: `${((c.timestamp_seconds ?? 0) / duration) * 100}%`,
                    transform: 'translate(-50%, -50%)',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: S.gold,
                    border: `2px solid ${S.bg}`,
                    pointerEvents: 'none',
                    zIndex: 1,
                  }}
                />
              ))
            }

            {/* Thumb */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: `${progressRatio * 100}%`,
              transform: `translate(-50%, -50%) scale(${scrubbing ? 1.3 : 1})`,
              width: 13,
              height: 13,
              borderRadius: '50%',
              background: S.text,
              border: `2px solid ${S.gold}`,
              pointerEvents: 'none',
              zIndex: 2,
              transition: 'transform 0.1s',
            }} />
          </div>
          </div>

          {/* Controls row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              style={{
                width: 34, height: 34,
                borderRadius: '50%',
                border: 'none',
                background: S.surface2,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {playing ? <IconPause /> : <IconPlay />}
            </button>

            {/* Time display */}
            <span style={{
              fontSize: '0.78rem',
              color: S.text2,
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
            }}>
              {formatTs(currentTime)} / {formatTs(duration)}
            </span>

            <div style={{ flex: 1 }} />

            {/* Add comment */}
            {!submitted && (
              <button
                onClick={openCommentForm}
                style={{
                  padding: '7px 14px',
                  borderRadius: 7,
                  border: `1px solid ${S.border}`,
                  background: 'none',
                  color: S.text2,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-dm-sans, sans-serif)',
                  transition: 'border-color 0.12s, color 0.12s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = S.gold
                  e.currentTarget.style.color = S.gold
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = S.border
                  e.currentTarget.style.color = S.text2
                }}
              >
                {t.addComment}
              </button>
            )}

            {/* Mute */}
            <button
              onClick={toggleMute}
              style={{
                width: 34, height: 34,
                borderRadius: '50%',
                border: 'none',
                background: S.surface2,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <IconVolume muted={muted} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Add comment modal ─────────────────────────────────────────────── */}
      {showCommentForm && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(10,9,8,0.82)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 100, padding: 24,
          }}
          onClick={() => setShowCommentForm(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: S.surface,
              border: `1px solid ${S.border}`,
              borderRadius: 12,
              padding: '24px',
              width: '100%',
              maxWidth: 440,
            }}
          >
            {/* Timestamp badge */}
            <div style={{ marginBottom: 14 }}>
              <span style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: 5,
                background: 'rgba(196,148,52,0.1)',
                color: S.gold,
                fontSize: '0.78rem',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.04em',
              }}>
                @ {formatTs(commentTimestamp)}
              </span>
            </div>

            {/* Text */}
            <textarea
              autoFocus
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddComment()
                if (e.key === 'Escape') setShowCommentForm(false)
              }}
              placeholder={t.writeComment}
              rows={3}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 12px',
                borderRadius: 8,
                border: `1px solid ${S.border}`,
                background: S.surface2,
                color: S.text,
                fontSize: '0.88rem',
                fontFamily: 'var(--font-dm-sans, sans-serif)',
                resize: 'vertical',
                outline: 'none',
                lineHeight: 1.55,
                marginBottom: 10,
                display: 'block',
              }}
            />

            {/* Author */}
            <input
              value={commentAuthor}
              onChange={e => setCommentAuthor(e.target.value)}
              placeholder={t.yourNameOptional}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 12px',
                borderRadius: 8,
                border: `1px solid ${S.border}`,
                background: S.surface2,
                color: S.text,
                fontSize: '0.82rem',
                fontFamily: 'var(--font-dm-sans, sans-serif)',
                outline: 'none',
                marginBottom: 16,
                display: 'block',
              }}
            />

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCommentForm(false)}
                style={{
                  padding: '9px 16px', borderRadius: 7,
                  border: `1px solid ${S.border}`,
                  background: 'none', color: S.text2,
                  fontSize: '0.82rem', cursor: 'pointer',
                  fontFamily: 'var(--font-dm-sans, sans-serif)',
                }}
              >
                {t.cancel}
              </button>
              <button
                onClick={handleAddComment}
                disabled={!commentText.trim() || addingComment}
                style={{
                  padding: '9px 20px', borderRadius: 7,
                  border: 'none',
                  background: commentText.trim() && !addingComment ? S.gold : S.surface2,
                  color: commentText.trim() && !addingComment ? '#0C0B09' : S.text3,
                  fontSize: '0.82rem', fontWeight: 700,
                  cursor: commentText.trim() && !addingComment ? 'pointer' : 'default',
                  fontFamily: 'var(--font-dm-sans, sans-serif)',
                  transition: 'background 0.15s',
                }}
              >
                {addingComment ? t.sending : t.add}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Submit confirm modal ──────────────────────────────────────────── */}
      {showSubmitConfirm && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(10,9,8,0.82)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 100, padding: 24,
          }}
          onClick={() => setShowSubmitConfirm(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: S.surface,
              border: `1px solid ${S.border}`,
              borderRadius: 12,
              padding: '28px 24px',
              width: '100%',
              maxWidth: 380,
              textAlign: 'center',
            }}
          >
            <h2 style={{
              fontFamily: 'Georgia, serif',
              fontSize: '1.2rem',
              color: S.text,
              marginBottom: 10,
              letterSpacing: '0.04em',
              fontWeight: 400,
            }}>
              {t.submitFeedback}
            </h2>
            <p style={{
              fontSize: '0.82rem',
              color: S.text2,
              lineHeight: 1.65,
              marginBottom: 24,
            }}>
              {t.confirmBody(comments.length)}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={() => setShowSubmitConfirm(false)}
                style={{
                  padding: '10px 20px', borderRadius: 8,
                  border: `1px solid ${S.border}`,
                  background: 'none', color: S.text2,
                  fontSize: '0.82rem', cursor: 'pointer',
                  fontFamily: 'var(--font-dm-sans, sans-serif)',
                }}
              >
                {t.cancel}
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  padding: '10px 24px', borderRadius: 8,
                  border: 'none',
                  background: S.gold,
                  color: '#0C0B09',
                  fontSize: '0.82rem', fontWeight: 700,
                  cursor: submitting ? 'default' : 'pointer',
                  fontFamily: 'var(--font-dm-sans, sans-serif)',
                  opacity: submitting ? 0.6 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {submitting ? t.sending : t.confirmAndSend}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
