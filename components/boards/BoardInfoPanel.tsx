'use client'

import { useState } from 'react'
import { C } from '@/lib/admin-theme'
import { type BoardData, updateBoardProjectSummary, updateBoardDeliveryDescription } from '@/lib/actions/boards'
import { updateProjectShootDates } from '@/lib/actions/calendar'
import { formatShootDates } from '@/lib/board-format'
import BoardContacts from './BoardContacts'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700,
      letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 12,
    }}>
      {children}
    </p>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.text3, marginBottom: 4 }}>
      {children}
    </div>
  )
}

const saveButtonStyle = (saving: boolean): React.CSSProperties => ({
  fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600,
  padding: '5px 12px', borderRadius: 6, cursor: saving ? 'wait' : 'pointer',
  background: C.accent, color: '#fff', border: 'none', opacity: saving ? 0.6 : 1,
})

const cancelButtonStyle: React.CSSProperties = {
  fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3,
  background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
}

// Redigerbar prosjektinfo-tekst — vises også til kunden på delte boards (PublicBoardInfoPanel),
// derfor egne felt lagret direkte på prosjektet (delivery_description/board_summary),
// i stedet for den AI-genererte møtenotat-oppsummeringen.
function EditableTextField({
  label, projectId, initialValue, placeholder, emptyText, onSave,
}: {
  label: string
  projectId: string
  initialValue: string | null
  placeholder: string
  emptyText: string
  onSave: (projectId: string, value: string | null) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [savedValue, setSavedValue] = useState(initialValue ?? '')
  const [value, setValue] = useState(initialValue ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const trimmed = value.trim()
    await onSave(projectId, trimmed || null)
    setSavedValue(trimmed)
    setSaving(false)
    setEditing(false)
  }

  if (editing) {
    return (
      <div style={{ marginBottom: 14 }}>
        <FieldLabel>{label}</FieldLabel>
        <textarea
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          rows={label === 'Om prosjektet' ? 5 : 2}
          placeholder={placeholder}
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'vertical',
            fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text,
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
            padding: '8px 10px', outline: 'none', lineHeight: 1.55,
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={save} disabled={saving} style={saveButtonStyle(saving)}>
            Lagre
          </button>
          <button onClick={() => { setValue(savedValue); setEditing(false) }} style={cancelButtonStyle}>
            Avbryt
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <FieldLabel>{label}</FieldLabel>
        <button
          onClick={() => setEditing(true)}
          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          Rediger
        </button>
      </div>
      <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text2, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
        {savedValue || emptyText}
      </div>
    </div>
  )
}

// Opptaksdato — hentet direkte fra projects.shoot_start/shoot_end (samme kilde som
// kalender/pipeline), redigerbar her slik at man slipper å hoppe til et annet sted
// for å sette den om den mangler.
function EditableShootDates({ projectId, initialStart, initialEnd }: {
  projectId: string
  initialStart: string | null
  initialEnd: string | null
}) {
  const [editing, setEditing] = useState(false)
  const [savedStart, setSavedStart] = useState(initialStart ?? '')
  const [savedEnd, setSavedEnd] = useState(initialEnd ?? '')
  const [start, setStart] = useState(initialStart ?? '')
  const [end, setEnd] = useState(initialEnd ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await updateProjectShootDates(projectId, start || null, end || null)
    setSavedStart(start)
    setSavedEnd(end)
    setSaving(false)
    setEditing(false)
  }

  const dateInputStyle: React.CSSProperties = {
    fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text,
    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
    padding: '6px 8px', outline: 'none',
  }

  if (editing) {
    return (
      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Opptak</FieldLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="date" value={start} onChange={e => setStart(e.target.value)} style={dateInputStyle} />
          <span style={{ color: C.text3, fontSize: '0.75rem' }}>–</span>
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={dateInputStyle} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={save} disabled={saving} style={saveButtonStyle(saving)}>
            Lagre
          </button>
          <button
            onClick={() => { setStart(savedStart); setEnd(savedEnd); setEditing(false) }}
            style={cancelButtonStyle}
          >
            Avbryt
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <FieldLabel>Opptak</FieldLabel>
        <button
          onClick={() => setEditing(true)}
          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          Rediger
        </button>
      </div>
      <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text2, lineHeight: 1.55 }}>
        {formatShootDates(savedStart || null, savedEnd || null)}
      </div>
    </div>
  )
}

export default function BoardInfoPanel({ data }: { data: BoardData }) {
  return (
    <div style={{
      width: 280, flexShrink: 0, overflowY: 'auto',
      borderLeft: `1px solid ${C.border}`, background: C.sidebar,
      padding: '20px 18px', fontFamily: 'var(--font-dm-sans)',
    }}>
      <SectionLabel>Prosjektinfo</SectionLabel>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginBottom: 14, lineHeight: 1.5 }}>
        Vises også til kunden på det delte boardet.
      </p>
      <EditableTextField
        label="Om prosjektet"
        projectId={data.projectId}
        initialValue={data.projectSummary}
        placeholder="Kort tekst om prosjektet — vises til kunden på det delte boardet."
        emptyText="Ingen tekst ennå — legg til slik at kunden ser noe her."
        onSave={updateBoardProjectSummary}
      />
      <EditableTextField
        label="Leveranse"
        projectId={data.projectId}
        initialValue={data.deliveryDescription}
        placeholder="Hva leveres til kunden — f.eks. «2 kampanjefilmer + 30 bilder»."
        emptyText="Ikke beskrevet ennå — legg til slik at kunden ser noe her."
        onSave={updateBoardDeliveryDescription}
      />
      <EditableShootDates projectId={data.projectId} initialStart={data.shootStart} initialEnd={data.shootEnd} />

      <div style={{ height: 1, background: C.border, margin: '18px 0' }} />

      <SectionLabel>Kontaktpersoner</SectionLabel>
      <BoardContacts
        boardId={data.board.id}
        projectCustomerId={data.projectCustomerId}
        initialLead={data.leadProfile}
        initialCustomerContact={data.customerContact}
      />
    </div>
  )
}
