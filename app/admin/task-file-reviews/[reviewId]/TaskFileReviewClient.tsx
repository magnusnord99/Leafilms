'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { respondToTaskFileReview } from '@/lib/actions/task-video-files'
import type { TaskVideoFile, TaskFileReview } from '@/lib/actions/task-video-files'
import { formatFileSize } from '@/lib/utils/file-size'
import { C } from '@/lib/admin-theme'

export default function TaskFileReviewClient({
  reviewId,
  data,
}: {
  reviewId: string
  data: { review: TaskFileReview; file: TaskVideoFile; taskTitle: string; projectTitle: string | null; signedUrl: string }
}) {
  const router = useRouter()
  const { review, file, taskTitle, projectTitle, signedUrl } = data
  const [comment, setComment] = useState(review.comment ?? '')
  const [submitting, setSubmitting] = useState<'approved' | 'changes_requested' | null>(null)
  const [done, setDone] = useState<'approved' | 'changes_requested' | null>(review.status !== 'pending' ? (review.status as 'approved' | 'changes_requested') : null)

  async function handleDecision(decision: 'approved' | 'changes_requested') {
    if (decision === 'changes_requested' && !comment.trim()) {
      alert('Skriv en kommentar før du ber om endringer')
      return
    }
    setSubmitting(decision)
    const result = await respondToTaskFileReview(reviewId, decision, comment)
    setSubmitting(null)
    if (result.ok) setDone(decision)
    else alert(result.error ?? 'Noe gikk galt')
  }

  if (done) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 380 }}>
          <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.1rem', fontWeight: 700, color: C.text, marginBottom: 8 }}>
            {done === 'approved' ? 'Godkjent' : 'Endringer sendt'}
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3 }}>
            {done === 'approved'
              ? 'Avsenderen har fått beskjed om at filen er godkjent.'
              : 'Avsenderen har fått beskjed om kommentarene dine.'}
          </p>
          <button
            onClick={() => router.push('/admin/internal')}
            style={{ marginTop: 16, padding: '8px 16px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'none', color: C.text2, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', cursor: 'pointer' }}
          >
            Til oppgavelisten
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 120 }}>
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '14px 20px' }}>
        <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', fontWeight: 700, color: C.text }}>
          {file.filename}
        </h1>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, marginTop: 2 }}>
          {taskTitle}{projectTitle ? ` — ${projectTitle}` : ''} · {formatFileSize(file.size_bytes)}
        </p>
      </div>

      <div style={{ maxWidth: 900, margin: '24px auto', padding: '0 20px' }}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- internt admin-verktøy */}
        <video controls src={signedUrl} style={{ width: '100%', borderRadius: 10, background: '#000' }} />
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: C.surface, borderTop: `1px solid ${C.border}`, padding: '12px 24px', display: 'flex', gap: 12, alignItems: 'flex-end', justifyContent: 'center' }}>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Kommentar (påkrevd hvis du ber om endringer)"
          rows={2}
          style={{ flex: 1, maxWidth: 480, boxSizing: 'border-box', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', outline: 'none', resize: 'none' }}
        />
        <button
          onClick={() => handleDecision('changes_requested')}
          disabled={submitting !== null}
          style={{ padding: '10px 16px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'none', color: '#D4645A', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, cursor: submitting ? 'default' : 'pointer' }}
        >
          {submitting === 'changes_requested' ? 'Sender...' : 'Be om endringer'}
        </button>
        <button
          onClick={() => handleDecision('approved')}
          disabled={submitting !== null}
          style={{ padding: '10px 18px', borderRadius: 7, border: 'none', background: C.accent, color: '#fff', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, cursor: submitting ? 'default' : 'pointer' }}
        >
          {submitting === 'approved' ? 'Sender...' : 'Godkjenn'}
        </button>
      </div>
    </div>
  )
}
