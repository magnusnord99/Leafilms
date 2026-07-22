'use client'

import { useEffect, useState } from 'react'
import { getAllProfiles } from '@/lib/actions/pipeline'
import { extractMentionIds, splitMentionSegments, type MentionableProfile } from '@/lib/mentions'
import { MentionTextInput } from '@/components/shared/MentionTextInput'
import { useBoardUi } from './boardContext'
import { useBoardComments } from './boardCommentsContext'

export default function CommentThread({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const { palette: P } = useBoardUi()
  const { threadsByCard, postComment, toggleResolved } = useBoardComments()
  const [profiles, setProfiles] = useState<MentionableProfile[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => { getAllProfiles().then(setProfiles) }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const entry = threadsByCard[cardId]
  const comments = entry?.comments ?? []
  const resolved = entry?.thread.resolved ?? false

  async function send() {
    if (!draft.trim() || sending) return
    setSending(true)
    const mentions = extractMentionIds(draft, profiles)
    await postComment(cardId, draft, mentions)
    setDraft('')
    setSending(false)
  }

  const nameFor = (authorId: string | null) => profiles.find(p => p.id === authorId)?.name || 'Ukjent'

  return (
    <div
      className="nodrag nopan"
      onClick={e => e.stopPropagation()}
      style={{
        width: 280, maxHeight: 360, display: 'flex', flexDirection: 'column',
        background: P.surface, border: `1px solid ${P.border}`, borderRadius: 10,
        boxShadow: '0 12px 32px rgba(0,0,0,0.5)', fontFamily: 'var(--font-dm-sans)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: `1px solid ${P.border}` }}>
        <button
          onClick={() => toggleResolved(cardId)}
          disabled={comments.length === 0}
          style={{
            fontSize: '0.68rem', fontWeight: 600, padding: '4px 8px', borderRadius: 6,
            background: resolved ? 'transparent' : `${P.accent}22`,
            color: resolved ? P.text2 : P.accent,
            border: `1px solid ${resolved ? P.border : P.accent}`,
            cursor: comments.length === 0 ? 'default' : 'pointer',
            opacity: comments.length === 0 ? 0.5 : 1,
          }}
        >
          {resolved ? 'Gjenåpne' : 'Merk som løst'}
        </button>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: P.text2, cursor: 'pointer', fontSize: '0.9rem', lineHeight: 1 }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {comments.length === 0 && (
          <p style={{ fontSize: '0.72rem', color: P.text2, textAlign: 'center', margin: '12px 0' }}>Ingen kommentarer ennå</p>
        )}
        {comments.map(c => (
          <div key={c.id}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginBottom: 2 }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 600, color: P.text }}>{nameFor(c.author_id)}</span>
              <span style={{ fontSize: '0.6rem', color: P.text2 }}>
                {new Date(c.created_at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: P.text, lineHeight: 1.5, margin: 0, wordBreak: 'break-word' }}>
              {splitMentionSegments(c.content, c.mentions, profiles).map((seg, i) =>
                seg.isMention
                  ? <span key={i} style={{ color: P.accent, fontWeight: 600 }}>{seg.text}</span>
                  : <span key={i}>{seg.text}</span>
              )}
            </p>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderTop: `1px solid ${P.border}` }}>
        <MentionTextInput
          value={draft}
          onChange={setDraft}
          onEnter={send}
          profiles={profiles}
          as="textarea"
          rows={1}
          placeholder="Skriv en kommentar..."
          disabled={sending}
          style={{
            flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: P.text,
            background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 6,
            padding: '6px 8px', outline: 'none', resize: 'none', lineHeight: 1.4, width: '100%',
          }}
        />
      </div>
    </div>
  )
}
