'use client'

import { useState } from 'react'
import { updateFeedbackStatus, deleteFeedback, replyToFeedback, type FeedbackItem } from '@/lib/actions/feedback'

const C = {
  bg: '#181920', surface: '#21212D', surface2: '#2A2A38',
  border: '#3C3C52', text: '#EEEEF2', text2: '#B4B4CC', text3: '#8484A0',
  accent: '#7C5CFC',
}

const PRIORITY_LABEL: Record<number, string> = { 1: 'Høy', 2: 'Medium', 3: 'Lav' }
const PRIORITY_COLOR: Record<number, string> = { 1: '#C05050', 2: '#C49434', 3: C.text3 }

const STATUS_OPTIONS = [
  { value: 'open',        label: 'Åpen' },
  { value: 'in_progress', label: 'Pågår' },
  { value: 'resolved',    label: 'Løst' },
] as const

const STATUS_COLOR: Record<string, string> = {
  open:        C.text3,
  in_progress: '#C49434',
  resolved:    '#4CAF7D',
}

function FeedbackCard({ item }: { item: FeedbackItem }) {
  const [status, setStatus] = useState(item.status)
  const [saving, setSaving] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState(item.admin_reply ?? '')
  const [savedReply, setSavedReply] = useState(item.admin_reply)
  const [sendingReply, setSendingReply] = useState(false)

  async function handleStatus(next: FeedbackItem['status']) {
    if (next === status) return
    setSaving(true)
    await updateFeedbackStatus(item.id, next)
    setStatus(next)
    setSaving(false)
  }

  async function handleDelete() {
    if (!confirm('Slett denne tilbakemeldingen?')) return
    await deleteFeedback(item.id)
    setDeleted(true)
  }

  async function handleReply() {
    if (!replyText.trim() || sendingReply) return
    setSendingReply(true)
    const result = await replyToFeedback(item.id, replyText.trim())
    setSendingReply(false)
    if (!result.error) {
      setSavedReply(replyText.trim())
      setReplyOpen(false)
    }
  }

  if (deleted) return null

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9,
      padding: '14px 16px', opacity: status === 'resolved' ? 0.55 : 1, transition: 'opacity 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: C.text, lineHeight: 1.5, margin: 0 }}>
          {item.message}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{
            padding: '2px 8px', borderRadius: 6,
            fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 700,
            color: PRIORITY_COLOR[item.priority], border: `1px solid ${PRIORITY_COLOR[item.priority]}40`,
            background: `${PRIORITY_COLOR[item.priority]}10`,
          }}>
            {PRIORITY_LABEL[item.priority]}
          </span>
          <button
            onClick={handleDelete}
            title="Slett"
            style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1, padding: 2 }}
            onMouseEnter={e => (e.currentTarget.style.color = '#C05050')}
            onMouseLeave={e => (e.currentTarget.style.color = C.text3)}
          >×</button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleStatus(opt.value)}
              disabled={saving}
              style={{
                padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: status === opt.value ? 600 : 400,
                border: `1px solid ${status === opt.value ? STATUS_COLOR[opt.value] : C.border}`,
                background: status === opt.value ? `${STATUS_COLOR[opt.value]}15` : 'none',
                color: status === opt.value ? STATUS_COLOR[opt.value] : C.text3,
                transition: 'all 0.12s',
                opacity: saving ? 0.5 : 1,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {item.page_url && (
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3 }}>{item.page_url}</span>
          )}
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3 }}>
            {new Date(item.created_at).toLocaleString('nb-NO')}
          </span>
        </div>
      </div>

      {item.image_path && (
        <a
          href={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/feedback/${item.image_path}`}
          target="_blank"
          rel="noreferrer"
          style={{ display: 'block', marginTop: 10, borderRadius: 6, overflow: 'hidden', border: `1px solid ${C.border}` }}
        >
          <img
            src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/feedback/${item.image_path}`}
            alt="Vedlegg"
            style={{ width: '100%', maxHeight: 180, objectFit: 'cover', display: 'block' }}
          />
        </a>
      )}

      {/* Svar til den som meldte inn saken */}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
        {savedReply && !replyOpen && (
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text2, fontStyle: 'italic', margin: 0 }}>
              &ldquo;{savedReply}&rdquo;
            </p>
            <button
              onClick={() => { setReplyText(savedReply); setReplyOpen(true) }}
              style={{ flexShrink: 0, fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Endre svar
            </button>
          </div>
        )}

        {!savedReply && !replyOpen && (
          <button
            onClick={() => setReplyOpen(true)}
            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Svar på denne
          </button>
        )}

        {replyOpen && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              autoFocus
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder="Skriv et svar..."
              rows={2}
              style={{
                flex: 1, resize: 'none', boxSizing: 'border-box',
                background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8,
                padding: '8px 10px', outline: 'none',
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text, lineHeight: 1.5,
              }}
            />
            <button
              onClick={handleReply}
              disabled={sendingReply || !replyText.trim()}
              style={{
                padding: '8px 12px', borderRadius: 8, border: 'none',
                background: C.accent, color: '#fff',
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600,
                cursor: replyText.trim() ? 'pointer' : 'not-allowed',
                opacity: (!replyText.trim() || sendingReply) ? 0.5 : 1,
              }}
            >
              {sendingReply ? 'Sender...' : 'Send'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, color, items }: { title: string; color: string; items: FeedbackItem[] }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color, marginBottom: 12 }}>
        {title} ({items.length})
      </h2>
      {items.length === 0
        ? <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>Ingen ennå.</p>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(item => <FeedbackCard key={item.id} item={item} />)}
          </div>
      }
    </div>
  )
}

export function FeedbackList({ initialItems }: { initialItems: FeedbackItem[] }) {
  const bugs = initialItems.filter(i => i.type === 'bug')
  const wishes = initialItems.filter(i => i.type === 'wish')

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '32px 24px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.2rem', fontWeight: 700, color: C.text, marginBottom: 6 }}>
          Tilbakemeldinger
        </h1>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, marginBottom: 32 }}>
          Innmeldte feil og ønsker fra teamet
        </p>
        <Section title="Feil" color="#C05050" items={bugs} />
        <Section title="Ønsker" color={C.accent} items={wishes} />
      </div>
    </div>
  )
}
