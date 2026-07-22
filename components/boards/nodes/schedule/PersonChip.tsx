'use client'

import { useState } from 'react'
import type { ResolvedSchedulePerson } from '@/lib/types'
import { updateCustomerContact, updateTeamMemberContact } from '@/lib/actions/schedule-people'
import { useBoardUi } from '../../boardContext'

type Props = {
  person: ResolvedSchedulePerson | undefined
  readOnly: boolean
  onRemove: () => void
  onUpdated: (person: ResolvedSchedulePerson) => void
}

export default function PersonChip({ person, readOnly, onRemove, onUpdated }: Props) {
  const { palette: P } = useBoardUi()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ email: person?.email ?? '', phone: person?.phone ?? '' })

  if (!person) return null

  const save = async () => {
    const patch = { email: draft.email || null, phone: draft.phone || null }
    const ok = person.ref.type === 'customer_contact'
      ? await updateCustomerContact(person.ref.id, patch)
      : await updateTeamMemberContact(person.ref.id, patch)
    if (ok) onUpdated({ ...person, ...patch })
    setOpen(false)
  }

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <span
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
          background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 999,
          fontSize: '0.68rem', color: P.text, cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        {person.name}
        {person.role && <span style={{ color: P.text2 }}>· {person.role}</span>}
        {!readOnly && (
          <span onClick={e => { e.stopPropagation(); onRemove() }} style={{ color: P.text2, marginLeft: 2 }}>✕</span>
        )}
      </span>

      {open && (
        <div
          className="nodrag"
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 20,
            width: 220, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 8,
            padding: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: P.text, marginBottom: 6 }}>{person.name}</div>
          <label style={{ fontSize: '0.62rem', color: P.text2 }}>E-post</label>
          <input
            value={draft.email}
            disabled={readOnly}
            onChange={e => setDraft(d => ({ ...d, email: e.target.value }))}
            placeholder="Ikke satt"
            style={{ width: '100%', background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 4, padding: '4px 6px', color: P.text, fontSize: '0.72rem', marginBottom: 6, outline: 'none' }}
          />
          <label style={{ fontSize: '0.62rem', color: P.text2 }}>Telefon</label>
          <input
            value={draft.phone}
            disabled={readOnly}
            onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))}
            placeholder="Ikke satt"
            style={{ width: '100%', background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 4, padding: '4px 6px', color: P.text, fontSize: '0.72rem', outline: 'none' }}
          />
          {!readOnly && (
            <button
              onClick={save}
              style={{ marginTop: 8, width: '100%', padding: '5px 0', background: P.accent, color: P.canvasBg, border: 'none', borderRadius: 4, fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer' }}
            >Lagre</button>
          )}
        </div>
      )}
    </span>
  )
}
