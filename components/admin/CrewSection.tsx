'use client'

import { useState } from 'react'
import { getAvatarColor } from '@/lib/avatar-colors'
import { updatePreprodData, getPitchTeamAsProdCrew, type PreprodCrewMember } from '@/lib/actions/preprod'

const C = {
  bg:       '#181920',
  surface:  '#21212D',
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text2:    '#B4B4CC',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
  accentBg: 'rgba(124,92,252,0.08)',
  danger:   '#E05555',
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 14 }}>
      {children}
    </p>
  )
}

function Avatar({ id, name, color, size = 26 }: { id: string; name: string | null; color?: string | null; size?: number }) {
  const initials = (name ?? 'U').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
  const resolvedColor = getAvatarColor({ id, color })
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: resolvedColor, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-dm-sans)', fontSize: size * 0.38, fontWeight: 700,
    }}>
      {initials}
    </div>
  )
}

// Delt mellom pre-prod- og produksjon-siden — begge viser/redigerer samme
// projects.pipeline_data.preprod.prod_crew.
export function CrewSection({
  title, crew, projectId, field, profiles, onChange, onCrewAdded, readOnly = false,
}: {
  title: string
  crew: PreprodCrewMember[]
  projectId: string
  field: 'prod_crew'
  profiles: { id: string; name: string | null; email: string; color: string | null }[]
  onChange: (crew: PreprodCrewMember[]) => void
  onCrewAdded?: (updated: PreprodCrewMember[]) => void
  readOnly?: boolean
}) {
  const [showPicker, setShowPicker] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [role, setRole] = useState('')
  const [importing, setImporting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editSelectedId, setEditSelectedId] = useState('')
  const [editRole, setEditRole] = useState('')

  const available = profiles.filter(p => !crew.some(c => c.profile_id === p.id))

  async function importFromPitch() {
    if (readOnly) return
    setImporting(true)
    const pitchCrew = await getPitchTeamAsProdCrew(projectId)
    if (pitchCrew.length > 0) {
      const merged = [
        ...pitchCrew,
        ...crew.filter(c => !pitchCrew.some(p => p.profile_id === c.profile_id)),
      ]
      onChange(merged)
      updatePreprodData(projectId, { [field]: merged })
      onCrewAdded?.(merged)
    }
    setImporting(false)
  }

  function addCrew() {
    if (readOnly || !selectedId) return
    const profile = profiles.find(p => p.id === selectedId)
    if (!profile) return
    const next = [...crew, { profile_id: selectedId, name: profile.name ?? profile.email, role: role.trim() || 'Crew' }]
    onChange(next)
    updatePreprodData(projectId, { [field]: next })
    onCrewAdded?.(next)
    setSelectedId('')
    setRole('')
    setShowPicker(false)
  }

  function remove(profileId: string) {
    if (readOnly) return
    const next = crew.filter(c => c.profile_id !== profileId)
    onChange(next)
    updatePreprodData(projectId, { [field]: next })
    onCrewAdded?.(next)
  }

  function startEdit(member: PreprodCrewMember) {
    setEditingId(member.profile_id)
    setEditSelectedId(member.profile_id)
    setEditRole(member.role)
    setShowPicker(false)
  }

  function saveEdit() {
    if (readOnly || !editingId || !editSelectedId) return
    const profile = profiles.find(p => p.id === editSelectedId)
    const next = crew.map(c =>
      c.profile_id === editingId
        ? { profile_id: editSelectedId, name: profile?.name ?? profile?.email ?? c.name, role: editRole.trim() || c.role }
        : c
    )
    onChange(next)
    updatePreprodData(projectId, { [field]: next })
    setEditingId(null)
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <SectionTitle>{title}</SectionTitle>
        <div style={{ display: 'flex', gap: 6 }}>
          {field === 'prod_crew' && !showPicker && (
            <button
              onClick={importFromPitch}
              disabled={readOnly || importing}
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 500,
                padding: '3px 8px', borderRadius: 5, cursor: importing ? 'wait' : 'pointer',
                background: 'transparent', color: C.text3,
                border: `1px solid ${C.border}`,
                opacity: importing ? 0.6 : 1,
              }}
            >
              {importing ? '...' : '↓ Hent fra pitch'}
            </button>
          )}
          {!showPicker && (
            <button
              onClick={() => setShowPicker(true)}
              disabled={readOnly}
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600,
                padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                background: C.accentBg, color: C.accent, border: '1px solid rgba(124,92,252,0.25)',
              }}
            >
              + Legg til
            </button>
          )}
        </div>
      </div>

      {showPicker && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, padding: '12px 14px', background: C.surface2, borderRadius: 6, border: `1px solid ${C.border}` }}>
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text,
              background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5,
              padding: '6px 8px', outline: 'none',
            }}
          >
            <option value="">Velg person...</option>
            {available.map(p => (
              <option key={p.id} value={p.id}>{p.name ?? p.email}</option>
            ))}
          </select>
          <input
            value={role}
            onChange={e => setRole(e.target.value)}
            placeholder="Rolle (f.eks. Kameramann, Editor...)"
            onKeyDown={e => e.key === 'Enter' && addCrew()}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text,
              background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5,
              padding: '6px 8px', outline: 'none', transition: 'border-color 0.12s',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
            onBlur={e => { e.currentTarget.style.borderColor = C.border }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={addCrew}
              disabled={readOnly || !selectedId}
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600,
                padding: '5px 12px', borderRadius: 5, cursor: selectedId ? 'pointer' : 'not-allowed',
                background: selectedId ? C.accentBg : 'transparent',
                color: selectedId ? C.accent : C.text3,
                border: `1px solid ${selectedId ? 'rgba(124,92,252,0.25)' : C.border}`,
              }}
            >
              Legg til
            </button>
            <button
              onClick={() => { setShowPicker(false); setSelectedId(''); setRole('') }}
              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', padding: '5px 10px', borderRadius: 5, cursor: 'pointer', background: 'transparent', color: C.text3, border: `1px solid ${C.border}` }}
            >
              Avbryt
            </button>
          </div>
        </div>
      )}

      {crew.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, fontStyle: 'italic' }}>
          Ingen tildelt ennå
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {crew.map(member => {
            const isEditing = editingId === member.profile_id
            return (
              <div key={member.profile_id} style={{ background: C.surface2, borderRadius: 6, border: `1px solid ${isEditing ? 'rgba(124,92,252,0.35)' : C.border}`, overflow: 'hidden', transition: 'border-color 0.12s' }}>
                {/* Normal visning */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px' }}>
                  <Avatar id={member.profile_id} name={member.name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 500, color: C.text }}>{member.name}</p>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>{member.role}</p>
                  </div>
                  <button
                    onClick={() => isEditing ? setEditingId(null) : startEdit(member)}
                    disabled={readOnly}
                    title="Rediger"
                    style={{ background: isEditing ? C.accentBg : 'none', border: `1px solid ${isEditing ? 'rgba(124,92,252,0.3)' : 'transparent'}`, borderRadius: 4, cursor: 'pointer', color: isEditing ? C.accent : C.text3, padding: '3px 5px', lineHeight: 0, transition: 'all 0.12s' }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => remove(member.profile_id)}
                    disabled={readOnly}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, padding: 2, lineHeight: 0, transition: 'color 0.12s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = C.danger }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.text3 }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M2 2l8 8M10 2L2 10" />
                    </svg>
                  </button>
                </div>

                {/* Inline redigeringsform */}
                {isEditing && (
                  <div style={{ padding: '10px 12px 12px', borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 8, background: C.accentBg }}>
                    <select
                      value={editSelectedId}
                      onChange={e => setEditSelectedId(e.target.value)}
                      style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, padding: '6px 8px', outline: 'none' }}
                    >
                      {profiles.map(p => (
                        <option key={p.id} value={p.id}>{p.name ?? p.email}</option>
                      ))}
                    </select>
                    <input
                      value={editRole}
                      onChange={e => setEditRole(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveEdit()}
                      placeholder="Rolle"
                      style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, padding: '6px 8px', outline: 'none' }}
                    />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={saveEdit}
                        disabled={readOnly}
                        style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, padding: '5px 12px', borderRadius: 5, cursor: 'pointer', background: C.accentBg, color: C.accent, border: '1px solid rgba(124,92,252,0.25)' }}
                      >
                        Lagre
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', padding: '5px 10px', borderRadius: 5, cursor: 'pointer', background: 'transparent', color: C.text3, border: `1px solid ${C.border}` }}
                      >
                        Avbryt
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
