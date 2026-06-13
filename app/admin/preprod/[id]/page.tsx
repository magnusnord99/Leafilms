'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  getPreprodDetail, updatePreprodData, updatePreprodTaskStatus,
  PreprodData, PreprodCrewMember, PackingItem,
} from '@/lib/actions/preprod'
import { toggleTaskAssignee } from '@/lib/actions/pipeline'
import type { Task } from '@/lib/types'
import type { PreprodDetail } from '@/lib/actions/preprod'

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

const PROFILE_COLORS = ['#7C5CFC', '#4A9AC4', '#4CAF7D', '#F0A500', '#E8529A', '#E07C3A']
function profileColor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0x7fffffff
  return PROFILE_COLORS[h % PROFILE_COLORS.length]
}

function Avatar({ id, name, size = 26 }: { id: string; name: string | null; size?: number }) {
  const initials = (name ?? 'U').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
  const color = profileColor(id)
  return (
    <div title={name ?? 'Ukjent'} style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `${color}22`, border: `1.5px solid ${color}55`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-dm-sans)', fontSize: size * 0.38, fontWeight: 700, color,
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
  title, crew, projectId, field, profiles, onChange,
}: {
  title: string
  crew: PreprodCrewMember[]
  projectId: string
  field: 'prod_crew' | 'post_crew'
  profiles: { id: string; name: string | null; email: string }[]
  onChange: (crew: PreprodCrewMember[]) => void
}) {
  const [showPicker, setShowPicker] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [role, setRole] = useState('')

  const available = profiles.filter(p => !crew.some(c => c.profile_id === p.id))

  function addCrew() {
    if (!selectedId) return
    const profile = profiles.find(p => p.id === selectedId)
    if (!profile) return
    const next = [...crew, { profile_id: selectedId, name: profile.name ?? profile.email, role: role.trim() || 'Crew' }]
    onChange(next)
    updatePreprodData(projectId, { [field]: next })
    setSelectedId('')
    setRole('')
    setShowPicker(false)
  }

  function remove(profileId: string) {
    const next = crew.filter(c => c.profile_id !== profileId)
    onChange(next)
    updatePreprodData(projectId, { [field]: next })
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <SectionTitle>{title}</SectionTitle>
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
          {crew.map(member => (
            <div key={member.profile_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: C.surface2, borderRadius: 6, border: `1px solid ${C.border}` }}>
              <Avatar id={member.profile_id} name={member.name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 500, color: C.text }}>{member.name}</p>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>{member.role}</p>
              </div>
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
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

function TaskList({
  tasks, profiles, onStatusChange,
}: {
  tasks: Task[]
  profiles: { id: string; name: string | null; email: string }[]
  onStatusChange: (taskId: string, status: Task['status']) => void
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PreprodDetailPage() {
  const { id } = useParams<{ id: string }>()

  const [project, setProject] = useState<PreprodDetail['project'] | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [profiles, setProfiles] = useState<{ id: string; name: string | null; email: string }[]>([])
  const [preprod, setPreprod] = useState<PreprodData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPreprodDetail(id).then(detail => {
      if (detail) {
        setProject(detail.project)
        setTasks(detail.tasks)
        setProfiles(detail.profiles)
        setPreprod(detail.project.preprod)
      }
      setLoading(false)
    })
  }, [id])

  function patchPreprod(patch: Partial<PreprodData>) {
    setPreprod(prev => prev ? { ...prev, ...patch } : prev)
  }

  function handleTaskStatusChange(taskId: string, status: Task['status']) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t))
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
            />

            {/* Fordeling: Post */}
            <CrewSection
              title="Fordeling — Post-produksjon"
              crew={preprod.post_crew}
              projectId={id}
              field="post_crew"
              profiles={profiles}
              onChange={next => patchPreprod({ post_crew: next })}
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
          </div>

        </div>
      </div>
    </div>
  )
}
