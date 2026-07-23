'use client'

import { useEffect, useState } from 'react'
import { getReviewHistory, requestReview, respondToReview } from '@/lib/actions/reviews'
import type { Review, ReviewSubjectType } from '@/lib/types'
import { C } from '@/lib/admin-theme'

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('nb-NO', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

const STATUS_LABEL: Record<Review['status'], string> = {
  pending: 'Venter på review',
  approved: 'Godkjent',
  changes_requested: 'Endringer ønsket',
}

const STATUS_COLOR: Record<Review['status'], string> = {
  pending: '#F0A500',
  approved: '#4CAF7D',
  changes_requested: C.danger,
}

export default function ReviewPanel({
  projectId,
  subjectType,
  enabled,
  currentUserId,
}: {
  projectId: string
  subjectType: ReviewSubjectType
  enabled: boolean
  currentUserId: string | null
}) {
  const [history, setHistory] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [commentBoxOpen, setCommentBoxOpen] = useState(false)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function reload() {
    const data = await getReviewHistory(projectId, subjectType)
    setHistory(data)
    setLoading(false)
  }

  useEffect(() => {
    if (!enabled) { setLoading(false); return }
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, subjectType, enabled])

  if (!enabled) return null
  if (loading) return null

  const latest = history[0] ?? null
  const isReviewer = latest?.status === 'pending' && latest.reviewer_id === currentUserId
  const label = subjectType === 'pitch' ? 'pitchen' : 'tilbudet'

  async function handleRequestReview() {
    setSubmitting(true)
    const result = await requestReview(projectId, subjectType)
    if (!result.ok) alert(result.error ?? 'Kunne ikke sende til review')
    await reload()
    setSubmitting(false)
  }

  async function handleApprove() {
    if (!latest) return
    setSubmitting(true)
    const result = await respondToReview(latest.id, 'approved')
    if (!result.ok) alert(result.error ?? 'Kunne ikke godkjenne')
    await reload()
    setSubmitting(false)
  }

  async function handleRequestChanges() {
    if (!latest || !comment.trim()) return
    setSubmitting(true)
    const result = await respondToReview(latest.id, 'changes_requested', comment.trim())
    if (!result.ok) alert(result.error ?? 'Kunne ikke sende tilbakemelding')
    setComment('')
    setCommentBoxOpen(false)
    await reload()
    setSubmitting(false)
  }

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {latest && (
          <span style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 500,
            color: STATUS_COLOR[latest.status], background: `${STATUS_COLOR[latest.status]}18`,
            padding: '2px 8px', borderRadius: 4,
          }}>
            {STATUS_LABEL[latest.status]}
            {latest.reviewer?.name || latest.reviewer?.email ? ` — ${latest.reviewer.name ?? latest.reviewer.email}` : ''}
          </span>
        )}
        {!latest && (
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>
            Ikke sendt til review ennå
          </span>
        )}

        {(!latest || latest.status !== 'pending') && (
          <button
            onClick={handleRequestReview}
            disabled={submitting}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 500,
              padding: '3px 10px', borderRadius: 5, cursor: submitting ? 'default' : 'pointer',
              background: 'none', color: C.accent, border: `1px solid ${C.accent}`,
              opacity: submitting ? 0.5 : 1,
            }}
          >
            Send til review
          </button>
        )}

        {history.length > 0 && (
          <button
            onClick={() => setHistoryOpen(o => !o)}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem',
              background: 'none', border: 'none', color: C.text3, cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            {historyOpen ? 'Skjul historikk' : `Historikk (${history.length})`}
          </button>
        )}
      </div>

      {isReviewer && (
        <div style={{
          marginTop: 8, padding: '10px 12px', borderRadius: 6,
          background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.3)',
        }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: '#F0A500', marginBottom: 8 }}>
            {latest?.requester?.name ?? latest?.requester?.email ?? 'Noen'} ber deg godkjenne {label}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={handleApprove}
              disabled={submitting}
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 600,
                padding: '5px 12px', borderRadius: 5, cursor: submitting ? 'default' : 'pointer',
                background: '#4CAF7D', color: '#fff', border: 'none', opacity: submitting ? 0.5 : 1,
              }}
            >
              Godkjenn
            </button>
            <button
              onClick={() => setCommentBoxOpen(o => !o)}
              disabled={submitting}
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 500,
                padding: '5px 12px', borderRadius: 5, cursor: submitting ? 'default' : 'pointer',
                background: 'none', color: C.text2, border: `1px solid ${C.border}`,
              }}
            >
              Be om endringer
            </button>
          </div>
          {commentBoxOpen && (
            <div style={{ marginTop: 8 }}>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={2}
                placeholder="Hva bør endres?"
                style={{
                  width: '100%', fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem',
                  padding: '6px 10px', borderRadius: 5, resize: 'vertical',
                  background: C.surface, border: `1px solid ${C.border}`, color: C.text, outline: 'none',
                }}
              />
              <button
                onClick={handleRequestChanges}
                disabled={submitting || !comment.trim()}
                style={{
                  marginTop: 6, fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 600,
                  padding: '5px 12px', borderRadius: 5,
                  cursor: submitting || !comment.trim() ? 'default' : 'pointer',
                  background: C.danger, color: '#fff', border: 'none',
                  opacity: submitting || !comment.trim() ? 0.5 : 1,
                }}
              >
                Send tilbakemelding
              </button>
            </div>
          )}
        </div>
      )}

      {historyOpen && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {history.map(r => (
            <div key={r.id} style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3,
              padding: '6px 10px', background: C.surface2, borderRadius: 5,
            }}>
              <span style={{ color: C.text2 }}>{r.requester?.name ?? r.requester?.email ?? 'Ukjent'}</span>
              {' → '}
              <span style={{ color: C.text2 }}>{r.reviewer?.name ?? r.reviewer?.email ?? 'Ukjent'}</span>
              {' · '}
              <span style={{ color: STATUS_COLOR[r.status] }}>{STATUS_LABEL[r.status]}</span>
              {' · '}
              {formatTime(r.requested_at)}
              {r.comment && <div style={{ marginTop: 3, fontStyle: 'italic' }}>&ldquo;{r.comment}&rdquo;</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
