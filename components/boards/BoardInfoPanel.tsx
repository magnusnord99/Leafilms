'use client'

import { C } from '@/lib/admin-theme'
import { formatShootDates, type BoardData } from '@/lib/actions/boards'
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.text3, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text2, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
        {value}
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
      <Field label="Sammendrag" value={data.projectSummary || 'Ingen sammendrag ennå — legg til fra møtenotater på prosjektsiden.'} />
      <Field label="Leveranse" value={data.deliveryDescription || 'Ikke beskrevet ennå.'} />
      <Field label="Opptak" value={formatShootDates(data.shootStart, data.shootEnd)} />

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
