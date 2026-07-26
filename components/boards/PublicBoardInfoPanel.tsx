'use client'

import { useState, Fragment } from 'react'
import { S } from '@/lib/client-theme'
import { getAvatarColor } from '@/lib/avatar-colors'
import { formatShootDates } from '@/lib/board-format'
import type { SharedBoardData } from '@/lib/actions/boards'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: S.fontBody, fontSize: '0.65rem', fontWeight: 700,
      letterSpacing: '0.08em', textTransform: 'uppercase', color: S.text3, marginBottom: 12,
    }}>
      {children}
    </p>
  )
}

function Avatar({ id, name, color }: { id: string; name: string; color?: string | null }) {
  return (
    <span style={{
      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
      background: getAvatarColor({ id, color }), color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 700,
    }}>
      {name[0]?.toUpperCase() ?? '?'}
    </span>
  )
}

function ContactRow({ label, id, name, sub, email, phone, color }: {
  label: string; id: string; name: string; sub?: string | null
  email?: string | null; phone?: string | null; color?: string | null
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: S.fontBody, fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: S.text3, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Avatar id={id} name={name} color={color} />
        <div>
          <div style={{ fontFamily: S.fontBody, fontSize: '0.78rem', color: S.text }}>{name}</div>
          {sub && <div style={{ fontFamily: S.fontBody, fontSize: '0.68rem', color: S.text2 }}>{sub}</div>}
          {email && <div style={{ fontFamily: S.fontBody, fontSize: '0.68rem', color: S.text2 }}>{email}</div>}
          {phone && <div style={{ fontFamily: S.fontBody, fontSize: '0.68rem', color: S.text2 }}>{phone}</div>}
        </div>
      </div>
    </div>
  )
}

function TextSection({ label, text }: { label: string; text: string }) {
  return (
    <>
      <SectionLabel>{label}</SectionLabel>
      <p style={{ fontFamily: S.fontBody, fontSize: '0.78rem', color: S.text2, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
        {text}
      </p>
    </>
  )
}

function buildSections(data: SharedBoardData): { key: string; node: React.ReactNode }[] {
  const sections: { key: string; node: React.ReactNode }[] = []

  if (data.projectSummary) {
    sections.push({ key: 'summary', node: <TextSection label="Om prosjektet" text={data.projectSummary} /> })
  }
  if (data.deliveryDescription) {
    sections.push({ key: 'delivery', node: <TextSection label="Leveranse" text={data.deliveryDescription} /> })
  }
  if (data.shootStart) {
    sections.push({ key: 'shoot', node: <TextSection label="Opptak" text={formatShootDates(data.shootStart, data.shootEnd)} /> })
  }
  if (data.leadProfile || data.customerContact) {
    sections.push({
      key: 'contacts',
      node: (
        <>
          <SectionLabel>Kontaktpersoner</SectionLabel>
          {data.leadProfile && (
            <ContactRow
              label="Leafilms"
              id={data.leadProfile.id}
              name={data.leadProfile.name ?? data.leadProfile.email}
              email={data.leadProfile.email}
              phone={data.leadProfile.phone}
              color={data.leadProfile.color}
            />
          )}
          {data.customerContact && (
            <ContactRow
              label="Kunde"
              id={data.customerContact.id}
              name={data.customerContact.name}
              sub={data.customerContact.role}
              phone={data.customerContact.phone}
            />
          )}
        </>
      ),
    })
  }

  return sections
}

function SectionList({ sections }: { sections: { key: string; node: React.ReactNode }[] }) {
  return (
    <>
      {sections.map((s, i) => (
        <Fragment key={s.key}>
          {i > 0 && <div style={{ height: 1, background: S.border, margin: '18px 0' }} />}
          {s.node}
        </Fragment>
      ))}
    </>
  )
}

export default function PublicBoardInfoPanel({ data }: { data: SharedBoardData }) {
  const [expanded, setExpanded] = useState(false)
  const sections = buildSections(data)
  if (sections.length === 0) return null

  return (
    <>
      {/* Fast sidepanel på desktop, dropdown øverst på mobil — én fast 280px-kolonne
          er ubrukelig på en telefonskjerm (spiser nesten hele bredden). */}
      <style>{`
        .lf-board-info-desktop { display: block; }
        .lf-board-info-mobile { display: none; }
        @media (max-width: 768px) {
          .lf-board-info-desktop { display: none; }
          .lf-board-info-mobile { display: block; order: -1; }
        }
      `}</style>

      <div className="lf-board-info-desktop" style={{
        width: 280, flexShrink: 0, overflowY: 'auto',
        borderLeft: `1px solid ${S.border}`, background: S.surface,
        padding: '20px 18px', fontFamily: S.fontBody,
      }}>
        <SectionList sections={sections} />
      </div>

      <div className="lf-board-info-mobile" style={{
        position: 'relative', flexShrink: 0,
        borderBottom: `1px solid ${S.border}`, background: S.surface,
      }}>
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: S.fontBody, fontSize: '0.72rem', fontWeight: 700,
            letterSpacing: '0.05em', textTransform: 'uppercase', color: S.text,
          }}
        >
          Prosjektinfo &amp; kontakt
          <span style={{ display: 'inline-block', transition: 'transform 0.15s', transform: expanded ? 'rotate(180deg)' : 'none' }}>⌄</span>
        </button>
        {expanded && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
            background: S.surface, borderBottom: `1px solid ${S.border}`,
            boxShadow: '0 12px 24px rgba(0,0,0,0.45)',
            padding: '4px 18px 18px', maxHeight: '70vh', overflowY: 'auto', fontFamily: S.fontBody,
          }}>
            <SectionList sections={sections} />
          </div>
        )}
      </div>
    </>
  )
}
