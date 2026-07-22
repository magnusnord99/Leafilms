'use client'

import { useEffect, useState } from 'react'
import type { CustomerContact, ResolvedSchedulePerson, SchedulePersonRef } from '@/lib/types'
import {
  searchCustomers, getCustomerContacts, createCustomerContact, listTeamMembers,
  type CustomerMatch, type TeamMemberOption,
} from '@/lib/actions/schedule-people'
import { useBoardUi } from '../../boardContext'

type Props = {
  onSelect: (ref: SchedulePersonRef, resolved: ResolvedSchedulePerson) => void
  onClose: () => void
}

export default function PersonPicker({ onSelect, onClose }: Props) {
  const { palette: P } = useBoardUi()
  const [tab, setTab] = useState<'customer' | 'team'>('customer')

  const [query, setQuery] = useState('')
  const [customerMatches, setCustomerMatches] = useState<CustomerMatch[]>([])
  const [activeCustomer, setActiveCustomer] = useState<CustomerMatch | null>(null)
  const [contacts, setContacts] = useState<CustomerContact[]>([])
  const [showNewForm, setShowNewForm] = useState(false)
  const [newContact, setNewContact] = useState({ name: '', role: '', email: '', phone: '' })

  const [team, setTeam] = useState<TeamMemberOption[]>([])
  const [teamQuery, setTeamQuery] = useState('')

  useEffect(() => {
    if (tab !== 'team' || team.length > 0) return
    listTeamMembers().then(setTeam)
  }, [tab, team.length])

  useEffect(() => {
    if (activeCustomer) return
    const handle = setTimeout(() => {
      if (query.trim().length < 2) { setCustomerMatches([]); return }
      searchCustomers(query).then(setCustomerMatches)
    }, 250)
    return () => clearTimeout(handle)
  }, [query, activeCustomer])

  useEffect(() => {
    if (!activeCustomer) { setContacts([]); return }
    getCustomerContacts(activeCustomer.id).then(setContacts)
  }, [activeCustomer])

  const pickContact = (c: CustomerContact) => {
    onSelect(
      { type: 'customer_contact', id: c.id },
      { ref: { type: 'customer_contact', id: c.id }, name: c.name, role: c.role, email: c.email, phone: c.phone },
    )
  }

  const pickTeamMember = (t: TeamMemberOption) => {
    onSelect(
      { type: 'team_member', id: t.id },
      { ref: { type: 'team_member', id: t.id }, name: t.name, role: t.role, email: t.email, phone: t.phone },
    )
  }

  const submitNewContact = async () => {
    if (!activeCustomer || !newContact.name.trim()) return
    const created = await createCustomerContact({
      customer_id: activeCustomer.id,
      name: newContact.name,
      email: newContact.email || null,
      phone: newContact.phone || null,
      role: newContact.role || null,
    })
    if (created) pickContact(created)
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '6px 0', textAlign: 'center', fontSize: '0.68rem', letterSpacing: '0.05em',
    textTransform: 'uppercase', cursor: 'pointer', color: active ? P.text : P.text2,
    borderBottom: `2px solid ${active ? P.accent : 'transparent'}`,
  })

  return (
    <div
      className="nodrag"
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 30,
        width: 260, maxHeight: 320, overflowY: 'auto', background: P.surface,
        border: `1px solid ${P.border}`, borderRadius: 8, padding: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          <div style={tabStyle(tab === 'customer')} onClick={() => setTab('customer')}>Kunde</div>
          <div style={tabStyle(tab === 'team')} onClick={() => setTab('team')}>Team</div>
        </div>
        <span onClick={onClose} style={{ cursor: 'pointer', color: P.text2, fontSize: '0.75rem', marginLeft: 8 }}>✕</span>
      </div>

      {tab === 'customer' && (
        !activeCustomer ? (
          <>
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Søk etter kunde..."
              style={{ width: '100%', background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 4, padding: '5px 8px', color: P.text, fontSize: '0.74rem', outline: 'none', marginBottom: 6 }}
            />
            {customerMatches.map(c => (
              <div key={c.id} onClick={() => setActiveCustomer(c)} style={{ padding: '5px 6px', fontSize: '0.72rem', color: P.text, cursor: 'pointer', borderRadius: 4 }}>
                {c.name}{c.company ? ` · ${c.company}` : ''}
              </div>
            ))}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: P.text }}>{activeCustomer.name}</span>
              <span onClick={() => {
                setActiveCustomer(null)
                setShowNewForm(false)
                setNewContact({ name: '', role: '', email: '', phone: '' })
              }} style={{ fontSize: '0.65rem', color: P.text2, cursor: 'pointer' }}>Bytt</span>
            </div>
            {contacts.map(c => (
              <div key={c.id} onClick={() => pickContact(c)} style={{ padding: '5px 6px', fontSize: '0.72rem', color: P.text, cursor: 'pointer', borderRadius: 4 }}>
                {c.name}{c.role ? ` · ${c.role}` : ''}
              </div>
            ))}
            {!showNewForm ? (
              <div onClick={() => setShowNewForm(true)} style={{ marginTop: 6, fontSize: '0.68rem', color: P.accent, cursor: 'pointer' }}>+ Ny kontaktperson</div>
            ) : (
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <input autoFocus value={newContact.name} onChange={e => setNewContact(n => ({ ...n, name: e.target.value }))} placeholder="Navn *" style={{ background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 4, padding: '4px 6px', color: P.text, fontSize: '0.7rem', outline: 'none' }} />
                <input value={newContact.role} onChange={e => setNewContact(n => ({ ...n, role: e.target.value }))} placeholder="Rolle (f.eks. Markedssjef)" style={{ background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 4, padding: '4px 6px', color: P.text, fontSize: '0.7rem', outline: 'none' }} />
                <input value={newContact.email} onChange={e => setNewContact(n => ({ ...n, email: e.target.value }))} placeholder="E-post" style={{ background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 4, padding: '4px 6px', color: P.text, fontSize: '0.7rem', outline: 'none' }} />
                <input value={newContact.phone} onChange={e => setNewContact(n => ({ ...n, phone: e.target.value }))} placeholder="Telefon" style={{ background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 4, padding: '4px 6px', color: P.text, fontSize: '0.7rem', outline: 'none' }} />
                <button onClick={submitNewContact} disabled={!newContact.name.trim()} style={{ padding: '5px 0', background: P.accent, color: P.canvasBg, border: 'none', borderRadius: 4, fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer' }}>Legg til og velg</button>
              </div>
            )}
          </>
        )
      )}

      {tab === 'team' && (
        <>
          <input
            autoFocus
            value={teamQuery}
            onChange={e => setTeamQuery(e.target.value)}
            placeholder="Søk i teamet..."
            style={{ width: '100%', background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 4, padding: '5px 8px', color: P.text, fontSize: '0.74rem', outline: 'none', marginBottom: 6 }}
          />
          {team.filter(t => t.name.toLowerCase().includes(teamQuery.toLowerCase())).map(t => (
            <div key={t.id} onClick={() => pickTeamMember(t)} style={{ padding: '5px 6px', fontSize: '0.72rem', color: P.text, cursor: 'pointer', borderRadius: 4 }}>
              {t.name} · {t.role}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
