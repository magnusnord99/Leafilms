'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  getPreprodDetail, updatePreprodData, updatePreprodTaskStatus, syncPostCrewToTask,
  getPitchTeamAsProdCrew, setTildelTaskStatus, PreprodData, PreprodCrewMember, PackingItem,
} from '@/lib/actions/preprod'
import { toggleTaskAssignee, setInvoiceAssignee, setProjectLead, getCurrentUserProfile, getTaskMessageCounts, updatePipelineStage } from '@/lib/actions/pipeline'
import { TaskChatToggle } from '@/components/task/TaskChatToggle'
import type { Task } from '@/lib/types'
import type { PreprodDetail } from '@/lib/actions/preprod'
import { getAvatarColor } from '@/lib/avatar-colors'

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
  success:  '#4CAF7D',
  warning:  '#F0A500',
  danger:   '#E05555',
}

function Avatar({ id, name, color, size = 26 }: { id: string; name: string | null; color?: string | null; size?: number }) {
  const initials = (name ?? 'U').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
  const resolvedColor = getAvatarColor({ id, color })
  return (
    <div title={name ?? 'Ukjent'} style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `${resolvedColor}22`, border: `1.5px solid ${resolvedColor}55`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-dm-sans)', fontSize: size * 0.38, fontWeight: 700, color: resolvedColor,
    }}>
      {initials}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 14 }}>
      {children}
    </p>
  )
}

// ─── Millanote ────────────────────────────────────────────────────────────────

function MillanoteCard({
  url, done, projectId, onChange,
}: {
  url: string; done: boolean; projectId: string; onChange: (patch: Partial<PreprodData>) => void
}) {
  const [localUrl, setLocalUrl] = useState(url)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleUrlChange(val: string) {
    setLocalUrl(val)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      onChange({ millanote_url: val })
      updatePreprodData(projectId, { millanote_url: val })
    }, 700)
  }

  function toggleDone() {
    const next = !done
    onChange({ millanote_done: next })
    updatePreprodData(projectId, { millanote_done: next })
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <SectionTitle>Millanote</SectionTitle>
        <button
          onClick={toggleDone}
          style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 600,
            padding: '3px 10px', borderRadius: 5, cursor: 'pointer', border: 'none',
            background: done ? 'rgba(76,175,125,0.15)' : C.surface2,
            color: done ? C.success : C.text3,
            transition: 'all 0.12s',
          }}
        >
          {done ? '✓ Satt opp' : 'Ikke satt opp'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={localUrl}
          onChange={e => handleUrlChange(e.target.value)}
          placeholder="Lim inn Millanote-lenke..."
          style={{
            flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem',
            color: C.text, background: C.surface2, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: '7px 10px', outline: 'none', transition: 'border-color 0.12s',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
          onBlur={e => { e.currentTarget.style.borderColor = C.border }}
        />
        {localUrl && (
          <a href={localUrl.startsWith('http') ? localUrl : `https://${localUrl}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            <button style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500,
              padding: '7px 12px', borderRadius: 6, cursor: 'pointer',
              background: C.accentBg, color: C.accent, border: '1px solid rgba(124,92,252,0.25)',
            }}>
              Åpne →
            </button>
          </a>
        )}
      </div>
    </div>
  )
}

// ─── Packing list ─────────────────────────────────────────────────────────────

function PackingList({
  items, projectId, quoteEquipment, onChange,
}: {
  items: PackingItem[]
  projectId: string
  quoteEquipment: { name: string }[]
  onChange: (items: PackingItem[]) => void
}) {
  const [newItem, setNewItem] = useState('')

  function save(next: PackingItem[]) {
    onChange(next)
    updatePreprodData(projectId, { packing_list: next })
  }

  function addItem() {
    if (!newItem.trim()) return
    const next = [...items, { id: crypto.randomUUID(), name: newItem.trim(), qty: 1, checked: false }]
    setNewItem('')
    save(next)
  }

  function toggleItem(id: string) {
    save(items.map(i => i.id === id ? { ...i, checked: !i.checked } : i))
  }

  function removeItem(id: string) {
    save(items.filter(i => i.id !== id))
  }

  function importFromQuote() {
    const existing = new Set(items.map(i => i.name.toLowerCase()))
    const toAdd = quoteEquipment
      .filter(e => !existing.has(e.name.toLowerCase()))
      .map(e => ({ id: crypto.randomUUID(), name: e.name, qty: 1, checked: false }))
    if (toAdd.length > 0) save([...items, ...toAdd])
  }

  const done = items.filter(i => i.checked).length

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <SectionTitle>
          Pakkeliste {items.length > 0 && `(${done}/${items.length})`}
        </SectionTitle>
        {quoteEquipment.length > 0 && (
          <button
            onClick={importFromQuote}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 500,
              padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
              background: 'transparent', color: C.text3, border: `1px solid ${C.border}`,
            }}
          >
            Importer fra tilbud
          </button>
        )}
      </div>

      {/* Add new */}
      <div style={{ display: 'flex', gap: 8, marginBottom: items.length > 0 ? 12 : 0 }}>
        <input
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addItem()}
          placeholder="Legg til utstyr..."
          style={{
            flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem',
            color: C.text, background: C.surface2, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: '7px 10px', outline: 'none', transition: 'border-color 0.12s',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
          onBlur={e => { e.currentTarget.style.borderColor = C.border }}
        />
        <button
          onClick={addItem}
          disabled={!newItem.trim()}
          style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600,
            padding: '7px 12px', borderRadius: 6, cursor: newItem.trim() ? 'pointer' : 'not-allowed',
            background: newItem.trim() ? C.accentBg : 'transparent',
            color: newItem.trim() ? C.accent : C.text3,
            border: `1px solid ${newItem.trim() ? 'rgba(124,92,252,0.25)' : C.border}`,
            transition: 'all 0.12s',
          }}
        >
          + Legg til
        </button>
      </div>

      {/* List */}
      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map(item => (
            <div
              key={item.id}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 6, background: C.surface2, border: `1px solid ${C.border}` }}
            >
              <button
                onClick={() => toggleItem(item.id)}
                style={{
                  width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
                  background: item.checked ? 'rgba(76,175,125,0.2)' : 'transparent',
                  border: `1.5px solid ${item.checked ? C.success : C.text3}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                  transition: 'all 0.12s',
                }}
              >
                {item.checked && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5L4 7.5L8.5 2.5" stroke={C.success} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <span style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem',
                color: item.checked ? C.text3 : C.text,
                textDecoration: item.checked ? 'line-through' : 'none',
                flex: 1,
              }}>
                {item.name}
              </span>
              <button
                onClick={() => removeItem(item.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, padding: 2, lineHeight: 0, transition: 'color 0.12s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = C.danger }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.text3 }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M2 2l8 8M10 2L2 10" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Crew section ─────────────────────────────────────────────────────────────

function CrewSection({
  title, crew, projectId, field, profiles, onChange, onCrewAdded,
}: {
  title: string
  crew: PreprodCrewMember[]
  projectId: string
  field: 'prod_crew' | 'post_crew'
  profiles: { id: string; name: string | null; email: string; color: string | null }[]
  onChange: (crew: PreprodCrewMember[]) => void
  onCrewAdded?: (updated: PreprodCrewMember[]) => void
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
    if (!selectedId) return
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
    if (!editingId || !editSelectedId) return
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
              disabled={importing}
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
              disabled={!selectedId}
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

// ─── PostCrewSection — oppgavebasert tildeling for post-produksjon ───────────

const POST_ROLES_VIDEO: { key: string; label: string }[] = [
  { key: 'video_logging',   label: 'Logging'   },
  { key: 'video_grovklipp', label: 'Grovklipp' },
  { key: 'video_klipp',     label: 'Klipp'     },
  { key: 'video_farger',    label: 'Farger'    },
  { key: 'video_lyd',       label: 'Lyd'       },
  { key: 'video_ferdig',    label: 'Ferdig'    },
]
const POST_ROLES_PHOTO: { key: string; label: string }[] = [
  { key: 'photo_selektering',        label: 'Selektering'        },
  { key: 'photo_seleksjon_til_kunde', label: 'Seleksjon til kunde' },
  { key: 'photo_redigering',         label: 'Redigering'         },
  { key: 'photo_ferdig',             label: 'Ferdig'             },
]

type RoleGroup = { heading: string; color: string; roles: { key: string; label: string }[] }

function resolveGroups(projectType: string | null | undefined): RoleGroup[] {
  if (projectType === 'photo') return [{ heading: 'Foto', color: '#4A9EFF', roles: POST_ROLES_PHOTO }]
  if (projectType === 'mixed') return [
    { heading: 'Video', color: '#C49434', roles: POST_ROLES_VIDEO },
    { heading: 'Foto',  color: '#4A9EFF', roles: POST_ROLES_PHOTO },
  ]
  return [{ heading: 'Video', color: '#C49434', roles: POST_ROLES_VIDEO }]
}

function PostCrewSection({
  crew, projectId, profiles, projectType, onChange, onCrewAdded,
}: {
  crew: PreprodCrewMember[]
  projectId: string
  profiles: { id: string; name: string | null; email: string; color: string | null }[]
  projectType: string | null | undefined
  onChange: (crew: PreprodCrewMember[]) => void
  onCrewAdded?: (updated: PreprodCrewMember[]) => void
}) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openKey) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenKey(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openKey])

  const groups = resolveGroups(projectType)

  function assignRole(key: string, profile: { id: string; name: string | null; email: string }) {
    const prev = crew.find(c => c.role === key)
    const next = [
      ...crew.filter(c => c.role !== key),
      { profile_id: profile.id, name: profile.name ?? profile.email, role: key },
    ]
    onChange(next)
    updatePreprodData(projectId, { post_crew: next })
    syncPostCrewToTask(projectId, key, profile.id, prev?.profile_id ?? null)
    onCrewAdded?.(next)
    setOpenKey(null)
  }

  function removeRole(key: string) {
    const prev = crew.find(c => c.role === key)
    const next = crew.filter(c => c.role !== key)
    onChange(next)
    updatePreprodData(projectId, { post_crew: next })
    if (prev) syncPostCrewToTask(projectId, key, null, prev.profile_id)
    onCrewAdded?.(next)
  }

  return (
    <div ref={ref} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 18px' }}>
      <SectionTitle>Fordeling — Post-produksjon</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {groups.map(group => (
          <div key={group.heading}>
            {groups.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: group.color, flexShrink: 0 }} />
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: group.color }}>
                  {group.heading}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {group.roles.map(({ key, label }) => {
                const member = crew.find(c => c.role === key)
                const isOpen = openKey === key
                const assigned = member
                  ? profiles.find(p => p.id === member.profile_id) ?? { id: member.profile_id, name: member.name, email: member.name, color: null }
                  : null

                return (
                  <div key={key} style={{ position: 'relative' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 12px', borderRadius: 7,
                      background: isOpen ? C.accentBg : C.surface2,
                      border: `1px solid ${isOpen ? 'rgba(124,92,252,0.3)' : C.border}`,
                      transition: 'all 0.12s',
                    }}>
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text2, flex: 1 }}>
                        {label}
                      </span>
                      {assigned ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <Avatar id={assigned.id} name={assigned.name} color={assigned.color} size={22} />
                          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text }}>
                            {assigned.name ?? assigned.email}
                          </span>
                          <button
                            onClick={() => setOpenKey(isOpen ? null : key)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, padding: '0 2px', lineHeight: 0, fontSize: '0.7rem' }}
                          >
                            ✎
                          </button>
                          <button
                            onClick={() => removeRole(key)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, padding: 2, lineHeight: 0, transition: 'color 0.12s' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = C.danger }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.text3 }}
                          >
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                              <path d="M2 2l8 8M10 2L2 10" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setOpenKey(isOpen ? null : key)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem',
                            color: isOpen ? C.accent : C.text3,
                            background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                          </svg>
                          Tildel
                        </button>
                      )}
                    </div>

                    {isOpen && (
                      <div style={{
                        position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 50,
                        background: C.surface2, border: `1px solid ${C.border}`,
                        borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                        minWidth: 200, padding: '3px 0',
                      }}>
                        {profiles.map(p => {
                          const isCurrent = assigned?.id === p.id
                          return (
                            <button
                              key={p.id}
                              onClick={() => assignRole(key, p)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 9,
                                width: '100%', padding: '7px 12px',
                                background: isCurrent ? C.accentBg : 'none',
                                border: 'none', cursor: 'pointer', textAlign: 'left',
                              }}
                              onMouseEnter={e => { if (!isCurrent) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)' }}
                              onMouseLeave={e => { if (!isCurrent) (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                            >
                              <Avatar id={p.id} name={p.name} color={p.color} size={22} />
                              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: isCurrent ? C.accent : C.text, flex: 1 }}>
                                {p.name ?? p.email}
                              </span>
                              {isCurrent && (
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                  <path d="M1.5 5L4 7.5L8.5 2.5" stroke={C.accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

function TaskList({
  tasks, profiles, onStatusChange, currentUserId, messageCounts, deepLinkTaskId,
}: {
  tasks: Task[]
  profiles: { id: string; name: string | null; email: string; color: string | null }[]
  onStatusChange: (taskId: string, status: Task['status']) => void
  currentUserId: string | null
  messageCounts: Record<string, number>
  deepLinkTaskId: string | null
}) {
  const [pickerOpenId, setPickerOpenId] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  async function handleAssigneeToggle(taskId: string, profileId: string) {
    setToggling(profileId)
    await toggleTaskAssignee(taskId, profileId)
    setToggling(null)
  }

  const STATUS_CYCLE: Record<Task['status'], Task['status']> = {
    todo: 'in_progress',
    in_progress: 'done',
    done: 'todo',
  }

  const STATUS_STYLE: Record<Task['status'], { label: string; color: string }> = {
    todo:        { label: 'Å gjøre',  color: C.text3   },
    in_progress: { label: 'Pågår',    color: C.warning  },
    done:        { label: 'Ferdig',   color: C.success  },
  }

  if (tasks.length === 0) {
    return (
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, fontStyle: 'italic', padding: '4px 0' }}>
        Ingen oppgaver funnet for dette steget.
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {tasks.map(task => {
        const s = STATUS_STYLE[task.status]
        const isOpen = pickerOpenId === task.id
        const assignedIds = new Set(task.assignees.map(a => a.id))

        return (
          <div key={task.id} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 7, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', flexWrap: 'wrap' }}>
              {/* Status toggle */}
              <button
                onClick={() => {
                  const next = STATUS_CYCLE[task.status]
                  onStatusChange(task.id, next)
                  updatePreprodTaskStatus(task.id, next)
                }}
                style={{
                  flexShrink: 0, width: 20, height: 20, borderRadius: 5, cursor: 'pointer', padding: 0,
                  background: task.status === 'done' ? 'rgba(76,175,125,0.18)' : task.status === 'in_progress' ? 'rgba(240,165,0,0.12)' : 'transparent',
                  border: `1.5px solid ${s.color}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s',
                }}
              >
                {task.status === 'done' && (
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M2 5.5L4.5 8L9 3" stroke={C.success} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {task.status === 'in_progress' && (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.warning }} />
                )}
              </button>

              {/* Title */}
              <span style={{ flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: task.status === 'done' ? C.text3 : C.text, textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>
                {task.title}
              </span>

              {/* Assignees */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {task.assignees.map(a => (
                  <Avatar key={a.id} id={a.id} name={a.name} size={24} />
                ))}
                <button
                  onClick={() => setPickerOpenId(isOpen ? null : task.id)}
                  style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', padding: 0,
                    background: isOpen ? C.accentBg : 'transparent',
                    border: `1.5px dashed ${isOpen ? C.accent : C.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: isOpen ? C.accent : C.text3, fontSize: '0.85rem', transition: 'all 0.12s',
                  }}
                >
                  +
                </button>
              </div>

              {/* Status label */}
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.04em', color: s.color, flexShrink: 0 }}>
                {s.label}
              </span>

              <TaskChatToggle
                taskId={task.id}
                taskTitle={task.title}
                currentUserId={currentUserId}
                profiles={profiles}
                messageCount={messageCounts[task.id] ?? 0}
                forceOpen={deepLinkTaskId === task.id}
              />
            </div>

            {/* Assignee picker */}
            {isOpen && (
              <div style={{ padding: '8px 14px 12px', borderTop: `1px solid ${C.border}`, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {profiles.map(p => {
                  const assigned = assignedIds.has(p.id)
                  const busy = toggling === p.id
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleAssigneeToggle(task.id, p.id)}
                      disabled={busy}
                      style={{
                        fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 500,
                        padding: '4px 10px', borderRadius: 20, cursor: busy ? 'wait' : 'pointer',
                        background: assigned ? C.accentBg : C.surface,
                        color: assigned ? C.accent : C.text2,
                        border: `1px solid ${assigned ? 'rgba(124,92,252,0.3)' : C.border}`,
                        display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.1s',
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      {assigned && <span style={{ fontSize: '0.6rem' }}>✓</span>}
                      {p.name ?? p.email}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Invoice assignee card ────────────────────────────────────────────────────

function InvoiceAssigneeCard({
  projectId,
  currentAssigneeId,
  profiles,
}: {
  projectId: string
  currentAssigneeId: string | null
  profiles: { id: string; name: string | null; email: string; color: string | null }[]
}) {
  const [assigneeId, setAssigneeId] = useState<string | null>(currentAssigneeId)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const assignee = profiles.find(p => p.id === assigneeId) ?? null

  async function select(profileId: string | null) {
    setSaving(true)
    setOpen(false)
    setAssigneeId(profileId)
    await setInvoiceAssignee(projectId, profileId)
    setSaving(false)
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px' }}>
      <SectionTitle>Faktura-ansvarlig</SectionTitle>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {assignee ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Avatar id={assignee.id} name={assignee.name} color={assignee.color} size={22} />
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text }}>{assignee.name ?? assignee.email}</span>
          </div>
        ) : (
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, fontStyle: 'italic' }}>Ikke tildelt</span>
        )}

        <div ref={ref} style={{ position: 'relative' }}>
          <button
            onClick={() => setOpen(v => !v)}
            disabled={saving}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600,
              color: C.accent, background: `${C.accent}14`, border: `1px solid ${C.accent}30`,
              borderRadius: 6, padding: '4px 10px', cursor: 'pointer', opacity: saving ? 0.5 : 1,
            }}
          >
            {assignee ? 'Bytt' : 'Tildel'}
          </button>

          {open && (
            <div style={{
              position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 50,
              background: C.surface2, border: `1px solid ${C.border}`,
              borderRadius: 8, minWidth: 190, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              padding: '4px 0',
            }}>
              {assignee && (
                <>
                  <button onClick={() => select(null)} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>
                    Fjern tildeling
                  </button>
                  <div style={{ height: 1, background: C.border }} />
                </>
              )}
              {profiles.map(p => (
                <button
                  key={p.id}
                  onClick={() => select(p.id)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '7px 12px',
                    background: p.id === assigneeId ? `${C.accent}14` : 'none',
                    border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-dm-sans)',
                  }}
                >
                  <Avatar id={p.id} name={p.name} color={p.color} size={18} />
                  <span style={{ fontSize: '0.78rem', color: C.text, fontWeight: p.id === assigneeId ? 600 : 400 }}>{p.name ?? p.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PreprodDetailPage() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const deepLinkTaskId = searchParams?.get('task') ?? null

  const [project, setProject] = useState<PreprodDetail['project'] | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [profiles, setProfiles] = useState<{ id: string; name: string | null; email: string; color: string | null }[]>([])
  const [preprod, setPreprod] = useState<PreprodData | null>(null)
  const [loading, setLoading] = useState(true)
  const [projectLead, setProjectLead_] = useState<{ id: string; name: string | null; email: string; color: string | null } | null>(null)
  const [leadDropdownOpen, setLeadDropdownOpen] = useState(false)
  const leadDropdownRef = useRef<HTMLDivElement>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [messageCounts, setMessageCounts] = useState<Record<string, number>>({})
  const [advancing, setAdvancing] = useState(false)

  useEffect(() => {
    getPreprodDetail(id).then(detail => {
      if (detail) {
        setProject(detail.project)
        setTasks(detail.tasks)
        setProfiles(detail.profiles)
        setPreprod(detail.project.preprod)
        setProjectLead_(detail.project.project_lead
          ? { ...detail.project.project_lead, color: detail.profiles.find(p => p.id === detail.project.project_lead!.id)?.color ?? null }
          : null)
        if (detail.tasks.length > 0) {
          getTaskMessageCounts(detail.tasks.map(t => t.id)).then(setMessageCounts)
        }
      }
      setLoading(false)
    })
    getCurrentUserProfile().then(profile => setCurrentUserId(profile?.id ?? null))
  }, [id])

  useEffect(() => {
    if (!leadDropdownOpen) return
    function handleClick(e: MouseEvent) {
      if (leadDropdownRef.current && !leadDropdownRef.current.contains(e.target as Node)) {
        setLeadDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [leadDropdownOpen])

  async function handleSetLead(profileId: string | null) {
    const prev = projectLead
    const profile = profileId ? profiles.find(p => p.id === profileId) ?? null : null
    setProjectLead_(profile)
    const result = await setProjectLead(id, profileId)
    if (!result.ok) setProjectLead_(prev)
  }

  function patchPreprod(patch: Partial<PreprodData>) {
    setPreprod(prev => prev ? { ...prev, ...patch } : prev)
  }

  function handleTaskStatusChange(taskId: string, status: Task['status']) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t))
  }

  async function handleCrewChanged(updatedProdCrew?: PreprodCrewMember[], updatedPostCrew?: PreprodCrewMember[]) {
    const prodCrew = updatedProdCrew ?? preprod?.prod_crew ?? []
    const postCrew = updatedPostCrew ?? preprod?.post_crew ?? []
    const hasProd = prodCrew.length > 0
    const hasPost = postCrew.length > 0
    const newStatus = (hasProd && hasPost) ? 'done' : (hasProd || hasPost) ? 'in_progress' : 'todo'
    await setTildelTaskStatus(id, newStatus)
    setTasks(prev => prev.map(t =>
      t.title === 'Tildel oppgaver til teamet' ? { ...t, status: newStatus } : t
    ))
  }

  async function handleAdvanceToProduction() {
    setAdvancing(true)
    await updatePipelineStage(id, 'produksjon')
    router.push(`/admin/projects/${id}`)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>Laster...</p>
      </div>
    )
  }

  if (!project || !preprod) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3 }}>Fant ikke prosjektet.</p>
      </div>
    )
  }

  if (project.pipeline_stage !== 'pre_prod') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 16 }}>
            Prosjektet er ikke lenger i pre-produksjon
          </p>
          <button onClick={() => router.push('/admin/preprod')} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', background: C.surface2, color: C.text2, border: `1px solid ${C.border}` }}>
            ← Tilbake
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '28px 28px 64px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 22 }}>
          <Link href="/admin/pipeline" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, textDecoration: 'none' }}>Pipeline</Link>
          <span style={{ color: C.text3, fontSize: '0.72rem' }}>›</span>
          <Link href="/admin/preprod" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, textDecoration: 'none' }}>Pre-prod</Link>
          <span style={{ color: C.text3, fontSize: '0.72rem' }}>›</span>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2 }}>{project.title}</span>
        </div>

        {/* Header */}
        <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.5rem', fontWeight: 700, color: C.text }}>
              {project.title}
            </h1>
            {project.customer && (
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, background: C.surface2, border: `1px solid ${C.border}`, padding: '3px 10px', borderRadius: 5 }}>
                {project.customer.name}
              </span>
            )}
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#4A9EFF', background: 'rgba(74,158,255,0.1)', border: '1px solid rgba(74,158,255,0.25)', padding: '3px 10px', borderRadius: 5 }}>
              Pre-produksjon
            </span>
            <button
              onClick={handleAdvanceToProduction}
              disabled={advancing}
              style={{
                marginLeft: 'auto', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600,
                padding: '7px 16px', borderRadius: 7, cursor: advancing ? 'default' : 'pointer',
                background: C.accent, color: '#fff', border: 'none',
                opacity: advancing ? 0.6 : 1, transition: 'opacity 0.15s',
              }}
            >
              {advancing ? 'Sender...' : '→ Send til produksjon'}
            </button>
          </div>
          {/* Prosjektleder */}
          <div style={{ position: 'relative', marginTop: 6 }} ref={leadDropdownRef}>
            <button
              onClick={() => setLeadDropdownOpen(v => !v)}
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
                background: 'none', border: `1px solid ${C.border}`,
                color: projectLead ? C.text2 : C.text3,
              }}
            >
              {projectLead ? (
                <>
                  <span style={{
                    width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                    background: getAvatarColor(projectLead), color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.58rem', fontWeight: 700,
                  }}>
                    {(projectLead.name ?? projectLead.email)[0].toUpperCase()}
                  </span>
                  {projectLead.name ?? projectLead.email}
                </>
              ) : (
                '+ Prosjektleder'
              )}
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                <path d="M2 4L6 8L10 4" stroke={C.text3} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {leadDropdownOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 5px)', left: 0, zIndex: 150,
                background: C.surface2, border: `1px solid ${C.border}`,
                borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                minWidth: 200, maxHeight: 260, overflowY: 'auto', padding: '4px 0',
              }}>
                {projectLead && (
                  <button
                    onClick={() => { handleSetLead(null); setLeadDropdownOpen(false) }}
                    style={{
                      width: '100%', textAlign: 'left',
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.73rem',
                      color: C.danger, background: 'none', border: 'none',
                      borderBottom: `1px solid ${C.border}`,
                      padding: '7px 14px', cursor: 'pointer',
                    }}
                  >
                    Fjern leder
                  </button>
                )}
                {profiles.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { handleSetLead(p.id); setLeadDropdownOpen(false) }}
                    style={{
                      width: '100%', textAlign: 'left',
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.73rem',
                      color: p.id === projectLead?.id ? C.accent : C.text,
                      background: 'none', border: 'none',
                      padding: '7px 14px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = C.bg}
                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}
                  >
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      background: getAvatarColor(p), color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.65rem', fontWeight: 700,
                    }}>
                      {(p.name ?? p.email)[0].toUpperCase()}
                    </span>
                    {p.name ?? p.email}
                    {p.id === projectLead?.id && (
                      <span style={{ marginLeft: 'auto', color: C.accent, fontSize: '0.65rem' }}>✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>

          {/* Left: Oppgaver + Fordeling */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Oppgaver */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 18px' }}>
              <SectionTitle>Oppgaver</SectionTitle>
              <TaskList
                tasks={tasks}
                profiles={profiles}
                onStatusChange={handleTaskStatusChange}
                currentUserId={currentUserId}
                messageCounts={messageCounts}
                deepLinkTaskId={deepLinkTaskId}
              />
            </div>

            {/* Fordeling: Produksjon */}
            <CrewSection
              title="Fordeling — Produksjonsdag"
              crew={preprod.prod_crew}
              projectId={id}
              field="prod_crew"
              profiles={profiles}
              onChange={next => patchPreprod({ prod_crew: next })}
              onCrewAdded={next => handleCrewChanged(next, undefined)}
            />

            {/* Fordeling: Post */}
            <PostCrewSection
              crew={preprod.post_crew}
              projectId={id}
              profiles={profiles}
              projectType={project.project_type}
              onChange={next => patchPreprod({ post_crew: next })}
              onCrewAdded={next => handleCrewChanged(undefined, next)}
            />
          </div>

          {/* Right: Millanote + Pakkeliste */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <MillanoteCard
              url={preprod.millanote_url}
              done={preprod.millanote_done}
              projectId={id}
              onChange={patchPreprod}
            />
            <PackingList
              items={preprod.packing_list}
              projectId={id}
              quoteEquipment={project.quote_equipment}
              onChange={next => patchPreprod({ packing_list: next })}
            />
            <InvoiceAssigneeCard
              projectId={id}
              currentAssigneeId={(project as { invoice_assignee_id?: string | null }).invoice_assignee_id ?? null}
              profiles={profiles}
            />
          </div>

        </div>
      </div>
    </div>
  )
}
