'use client'

import { useEffect, useRef, useState } from 'react'
import { C } from '@/lib/admin-theme'
import { getAvatarColor } from '@/lib/avatar-colors'
import { getAllProfiles } from '@/lib/actions/pipeline'
import { setBoardLead, setBoardCustomerContact, type BoardLeadProfile, type BoardCustomerContact } from '@/lib/actions/boards'
import { getCustomerContacts, createCustomerContact } from '@/lib/actions/schedule-people'
import type { CustomerContact } from '@/lib/types'

type Profile = { id: string; name: string | null; email: string; color: string | null; phone: string | null }

function useOutsideClose(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose])
  return ref
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 500,
    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
    padding: '5px 9px', borderRadius: 6, cursor: 'pointer',
    background: 'none', border: `1px solid ${C.border}`,
    color: active ? C.text2 : C.text3,
  }
}

function Avatar({ id, name, color, size = 18 }: { id: string; name: string; color?: string | null; size?: number }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: getAvatarColor({ id, color }), color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.32, fontWeight: 700,
    }}>
      {name[0]?.toUpperCase() ?? '?'}
    </span>
  )
}

// ─── Leafilms-kontakt (profiles, samme kilde som project_lead_id) ────────────

function LeadContactPicker({
  boardId, lead, onChange,
}: {
  boardId: string
  lead: BoardLeadProfile | null
  onChange: (lead: BoardLeadProfile | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const ref = useOutsideClose(open, () => setOpen(false))

  useEffect(() => {
    if (!open || profiles.length > 0) return
    getAllProfiles().then(setProfiles)
  }, [open, profiles.length])

  async function pick(p: Profile | null) {
    setOpen(false)
    onChange(p)
    await setBoardLead(boardId, p?.id ?? null)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)} style={pillStyle(!!lead)}>
        {lead ? (
          <>
            <Avatar id={lead.id} name={lead.name ?? lead.email} color={lead.color} />
            {lead.name ?? lead.email}
          </>
        ) : '+ Leafilms-kontakt'}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 5px)', left: 0, zIndex: 150,
          background: C.surface2, border: `1px solid ${C.border}`,
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          minWidth: 200, maxHeight: 260, overflowY: 'auto', padding: '4px 0',
        }}>
          {lead && (
            <button
              onClick={() => pick(null)}
              style={{
                width: '100%', textAlign: 'left', fontFamily: 'var(--font-dm-sans)', fontSize: '0.73rem',
                color: '#E05555', background: 'none', border: 'none', borderBottom: `1px solid ${C.border}`,
                padding: '7px 14px', cursor: 'pointer',
              }}
            >
              Fjern kontakt
            </button>
          )}
          {profiles.map(p => (
            <button
              key={p.id}
              onClick={() => pick(p)}
              style={{
                width: '100%', textAlign: 'left', fontFamily: 'var(--font-dm-sans)', fontSize: '0.73rem',
                color: p.id === lead?.id ? C.accent : C.text, background: 'none', border: 'none',
                padding: '7px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = C.bg}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}
            >
              <Avatar id={p.id} name={p.name ?? p.email} color={p.color} size={22} />
              {p.name ?? p.email}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Kundekontakt (customer_contacts for prosjektets kunde) ──────────────────

function CustomerContactPicker({
  boardId, customerId, contact, onChange,
}: {
  boardId: string
  customerId: string | null
  contact: BoardCustomerContact | null
  onChange: (contact: BoardCustomerContact | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [contacts, setContacts] = useState<CustomerContact[]>([])
  const [showNewForm, setShowNewForm] = useState(false)
  const [newContact, setNewContact] = useState({ name: '', role: '', email: '', phone: '' })
  const ref = useOutsideClose(open, () => { setOpen(false); setShowNewForm(false) })

  useEffect(() => {
    if (!open || !customerId) return
    getCustomerContacts(customerId).then(setContacts)
  }, [open, customerId])

  async function pick(c: CustomerContact | null) {
    setOpen(false)
    setShowNewForm(false)
    onChange(c ? { id: c.id, name: c.name, role: c.role, phone: c.phone } : null)
    await setBoardCustomerContact(boardId, c?.id ?? null)
  }

  async function submitNewContact() {
    if (!customerId || !newContact.name.trim()) return
    const created = await createCustomerContact({
      customer_id: customerId,
      name: newContact.name,
      email: newContact.email || null,
      phone: newContact.phone || null,
      role: newContact.role || null,
    })
    if (created) {
      setNewContact({ name: '', role: '', email: '', phone: '' })
      await pick(created)
    }
  }

  const inputStyle: React.CSSProperties = {
    background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4,
    padding: '4px 6px', color: C.text, fontSize: '0.7rem', outline: 'none',
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)} style={pillStyle(!!contact)}>
        {contact ? (
          <>
            <Avatar id={contact.id} name={contact.name} />
            {contact.name}
          </>
        ) : (customerId ? '+ Kundekontakt' : 'Ingen kunde koblet til prosjektet')}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 5px)', left: 0, zIndex: 150,
          background: C.surface2, border: `1px solid ${C.border}`,
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          minWidth: 220, maxHeight: 320, overflowY: 'auto', padding: '8px 10px',
        }}>
          {contact && (
            <button
              onClick={() => pick(null)}
              style={{
                width: '100%', textAlign: 'left', fontFamily: 'var(--font-dm-sans)', fontSize: '0.73rem',
                color: '#E05555', background: 'none', border: 'none', borderBottom: `1px solid ${C.border}`,
                padding: '7px 4px', marginBottom: 6, cursor: 'pointer',
              }}
            >
              Fjern kontakt
            </button>
          )}
          {!customerId ? (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, fontStyle: 'italic', margin: 0, padding: '4px' }}>
              Prosjektet mangler kobling til en kunde — sett kunde på prosjektet for å velge kontaktperson.
            </p>
          ) : (
            <>
              {contacts.map(c => (
                <div
                  key={c.id}
                  onClick={() => pick(c)}
                  style={{
                    padding: '6px 4px', fontSize: '0.73rem',
                    color: c.id === contact?.id ? C.accent : C.text, cursor: 'pointer', borderRadius: 4,
                  }}
                >
                  {c.name}{c.role ? ` · ${c.role}` : ''}
                </div>
              ))}
              {!showNewForm ? (
                <div onClick={() => setShowNewForm(true)} style={{ marginTop: 4, fontSize: '0.7rem', color: C.accent, cursor: 'pointer', padding: '4px' }}>
                  + Ny kontaktperson
                </div>
              ) : (
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <input autoFocus value={newContact.name} onChange={e => setNewContact(n => ({ ...n, name: e.target.value }))} placeholder="Navn *" style={inputStyle} />
                  <input value={newContact.role} onChange={e => setNewContact(n => ({ ...n, role: e.target.value }))} placeholder="Rolle" style={inputStyle} />
                  <input value={newContact.email} onChange={e => setNewContact(n => ({ ...n, email: e.target.value }))} placeholder="E-post" style={inputStyle} />
                  <input value={newContact.phone} onChange={e => setNewContact(n => ({ ...n, phone: e.target.value }))} placeholder="Telefon" style={inputStyle} />
                  <button
                    onClick={submitNewContact}
                    disabled={!newContact.name.trim()}
                    style={{ padding: '5px 0', background: C.accent, color: '#fff', border: 'none', borderRadius: 4, fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Legg til og velg
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function BoardContacts({
  boardId, projectCustomerId, initialLead, initialCustomerContact,
}: {
  boardId: string
  projectCustomerId: string | null
  initialLead: BoardLeadProfile | null
  initialCustomerContact: BoardCustomerContact | null
}) {
  const [lead, setLead] = useState(initialLead)
  const [contact, setContact] = useState(initialCustomerContact)

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600,
    letterSpacing: '0.05em', textTransform: 'uppercase', color: C.text3, marginBottom: 5,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={labelStyle}>Leafilms</div>
        <LeadContactPicker boardId={boardId} lead={lead} onChange={setLead} />
      </div>
      <div>
        <div style={labelStyle}>Kunde</div>
        <CustomerContactPicker boardId={boardId} customerId={projectCustomerId} contact={contact} onChange={setContact} />
      </div>
    </div>
  )
}
