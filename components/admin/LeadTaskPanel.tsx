'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  getProjectStageTasks, getAllProfiles, toggleTaskAssignee, updateTaskStatus, createTask,
} from '@/lib/actions/pipeline'
import { assignLead } from '@/lib/actions/leads'
import { C } from '@/lib/admin-theme'
import { PIPELINE_STAGE_LABELS_SHORT, TASK_STATUS_LABELS, TASK_STATUS_CYCLE, type Task, type PipelineStage } from '@/lib/types'

type Profile = { id: string; name: string | null; email: string }

const STAGE_LABELS: Record<string, string> = PIPELINE_STAGE_LABELS_SHORT

const QUICK_TASKS = ['Send tilbud', 'Følg opp lead', 'Book møte', 'Ring tilbake']

// admin-theme mangler success/warning — samme verdier som leads-listen bruker lokalt
const SUCCESS = '#4CAF7D'
const WARNING = '#F0A500'

const STATUS_CYCLE = TASK_STATUS_CYCLE

const STATUS_STYLE: Record<Task['status'], { label: string; color: string }> = {
  todo:        { label: TASK_STATUS_LABELS.todo,        color: C.text3 },
  in_progress: { label: TASK_STATUS_LABELS.in_progress, color: WARNING },
  done:        { label: TASK_STATUS_LABELS.done,        color: SUCCESS },
}

function Initials({ p, active }: { p: Profile; active: boolean }) {
  return (
    <span style={{
      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
      background: active ? C.accent : C.surface,
      border: `1px solid ${active ? C.accent : C.border}`,
      color: active ? '#fff' : C.text2,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '0.6rem', fontWeight: 700,
    }}>
      {(p.name ?? p.email)[0].toUpperCase()}
    </span>
  )
}

function AssigneePicker({ task, profiles, onToggle }: {
  task: Task
  profiles: Profile[]
  onToggle: (taskId: string, profileId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Tildel oppgave"
        style={{
          display: 'flex', alignItems: 'center', gap: 3,
          padding: '2px 6px', borderRadius: 4, cursor: 'pointer',
          background: open ? C.accentBg : 'transparent',
          border: `1px solid ${open ? 'rgba(124,92,252,0.35)' : C.border}`,
        }}
      >
        {task.assignees.length > 0 ? (
          <div style={{ display: 'flex' }}>
            {task.assignees.slice(0, 3).map((a, i) => (
              <span key={a.id} style={{
                width: 16, height: 16, borderRadius: '50%',
                background: C.accent, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.5rem', fontWeight: 700,
                marginLeft: i > 0 ? -4 : 0,
                border: `1.5px solid ${C.surface}`,
                position: 'relative', zIndex: 3 - i,
              }}>
                {(a.name ?? a.email)[0].toUpperCase()}
              </span>
            ))}
          </div>
        ) : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.text3} strokeWidth="2" strokeLinecap="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
        )}
        <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
          <path d="M1 2L3.5 5L6 2" stroke={C.text3} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 200,
          background: C.surface2, border: `1px solid ${C.border}`,
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          minWidth: 190, maxHeight: 220, overflowY: 'auto', padding: '3px 0',
        }}>
          {profiles.map(p => {
            const isAssigned = task.assignees.some(a => a.id === p.id)
            return (
              <button
                key={p.id}
                onClick={() => { onToggle(task.id, p.id); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '6px 12px',
                  background: isAssigned ? C.accentBg : 'none',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <Initials p={p} active={isAssigned} />
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: isAssigned ? C.accent : C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name ?? p.email}
                </span>
                {isAssigned && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
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
}

export default function LeadTaskPanel({ projectId, leadId, assignedTo, canCreate }: {
  projectId: string
  leadId: string
  assignedTo: string | null
  canCreate: boolean
}) {
  const [stage, setStage] = useState<PipelineStage | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [owner, setOwner] = useState<string | null>(assignedTo)
  const [ownerOpen, setOwnerOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const [newTitle, setNewTitle] = useState('')
  const [newDue, setNewDue] = useState('')
  const [newAssignees, setNewAssignees] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const ownerRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const result = await getProjectStageTasks(projectId)
    if (result) { setStage(result.stage); setTasks(result.tasks) }
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    load()
    getAllProfiles().then(setProfiles)
  }, [load])

  useEffect(() => {
    if (!ownerOpen) return
    const handler = (e: MouseEvent) => {
      if (ownerRef.current && !ownerRef.current.contains(e.target as Node)) setOwnerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ownerOpen])

  async function handleOwner(profileId: string | null) {
    setOwner(profileId)
    setOwnerOpen(false)
    await assignLead(leadId, profileId)
  }

  async function handleToggleAssignee(taskId: string, profileId: string) {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t
      const has = t.assignees.some(a => a.id === profileId)
      const p = profiles.find(p => p.id === profileId)
      return {
        ...t,
        assignees: has
          ? t.assignees.filter(a => a.id !== profileId)
          : [...t.assignees, ...(p ? [p] : [])],
      }
    }))
    await toggleTaskAssignee(taskId, profileId)
  }

  async function handleStatus(task: Task) {
    const next = STATUS_CYCLE[task.status]
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t))
    await updateTaskStatus(task.id, next)
    // Steget kan ha auto-avansert — last på nytt
    await load()
  }

  async function handleCreate() {
    if (!newTitle.trim() || !stage || creating) return
    setCreating(true)
    const created = await createTask({
      project_id: projectId,
      pipeline_stage: stage,
      title: newTitle.trim(),
      due_date: newDue || undefined,
    })
    if (created) {
      for (const pid of newAssignees) {
        await toggleTaskAssignee(created.id, pid)
      }
      setNewTitle(''); setNewDue(''); setNewAssignees([])
      await load()
    }
    setCreating(false)
  }

  const ownerProfile = profiles.find(p => p.id === owner) ?? null

  const label = (s: string | number) => ({
    fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700,
    letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: C.text3, marginBottom: s,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Ansvarlig */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '18px 20px' }}>
        <p style={label(12)}>Ansvarlig</p>
        <div ref={ownerRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setOwnerOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
              background: C.surface2, border: `1px solid ${ownerOpen ? 'rgba(124,92,252,0.35)' : C.border}`,
              textAlign: 'left',
            }}
          >
            {ownerProfile ? (
              <>
                <Initials p={ownerProfile} active />
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text, flex: 1 }}>
                  {ownerProfile.name ?? ownerProfile.email}
                </span>
              </>
            ) : (
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, flex: 1, fontStyle: 'italic' }}>
                Ingen ansvarlig
              </span>
            )}
            <svg width="8" height="8" viewBox="0 0 7 7" fill="none">
              <path d="M1 2L3.5 5L6 2" stroke={C.text3} strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          {ownerOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
              background: C.surface2, border: `1px solid ${C.border}`,
              borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              maxHeight: 220, overflowY: 'auto', padding: '3px 0',
            }}>
              <button
                onClick={() => handleOwner(null)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              >
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, fontStyle: 'italic' }}>Ingen ansvarlig</span>
              </button>
              {profiles.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleOwner(p.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 12px',
                    background: owner === p.id ? C.accentBg : 'none',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <Initials p={p} active={owner === p.id} />
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: owner === p.id ? C.accent : C.text }}>
                    {p.name ?? p.email}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Oppgaver */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <p style={label(0)}>Oppgaver</p>
          {stage && (
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>
              Steg: {STAGE_LABELS[stage] ?? stage}
            </span>
          )}
        </div>

        {loading ? (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>Laster...</p>
        ) : tasks.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, fontStyle: 'italic', marginBottom: canCreate ? 14 : 0 }}>
            Ingen oppgaver i dette steget.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: canCreate ? 16 : 0 }}>
            {tasks.map(task => {
              const st = STATUS_STYLE[task.status]
              return (
                <div key={task.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 8,
                  background: C.surface2, border: `1px solid ${C.border}`,
                }}>
                  <button
                    onClick={() => handleStatus(task)}
                    title="Bytt status"
                    style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', fontWeight: 600,
                      letterSpacing: '0.04em', textTransform: 'uppercase', flexShrink: 0,
                      color: st.color, background: `${st.color}14`,
                      border: `1px solid ${st.color}30`,
                      padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                      minWidth: 86,
                    }}
                  >
                    {st.label}
                  </button>
                  <span style={{
                    fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem',
                    color: task.status === 'done' ? C.text3 : C.text,
                    textDecoration: task.status === 'done' ? 'line-through' : 'none',
                    flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {task.title}
                  </span>
                  {task.due_date && (
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, flexShrink: 0 }}>
                      {new Date(task.due_date).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                  <AssigneePicker task={task} profiles={profiles} onToggle={handleToggleAssignee} />
                </div>
              )
            })}
          </div>
        )}

        {canCreate && (
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
            {/* Hurtigknapper */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {QUICK_TASKS.map(q => (
                <button
                  key={q}
                  onClick={() => setNewTitle(q)}
                  style={{
                    fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 500,
                    padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
                    background: newTitle === q ? C.accentBg : 'transparent',
                    color: newTitle === q ? C.accent : C.text3,
                    border: `1px solid ${newTitle === q ? 'rgba(124,92,252,0.35)' : C.border}`,
                    transition: 'all 0.12s',
                  }}
                >
                  + {q}
                </button>
              ))}
            </div>

            {/* Tittel + frist */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                placeholder="Ny oppgave..."
                style={{
                  flex: 1, minWidth: 0, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem',
                  color: C.text, background: C.surface2,
                  border: `1px solid ${C.border}`, borderRadius: 6,
                  padding: '7px 10px', outline: 'none',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                onBlur={e => { e.currentTarget.style.borderColor = C.border }}
              />
              <input
                type="date"
                value={newDue}
                onChange={e => setNewDue(e.target.value)}
                title="Frist"
                style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem',
                  color: newDue ? C.text : C.text3, background: C.surface2,
                  border: `1px solid ${C.border}`, borderRadius: 6,
                  padding: '7px 8px', outline: 'none', colorScheme: 'dark',
                }}
              />
            </div>

            {/* Tildel ved opprettelse */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>Tildel:</span>
              {profiles.map(p => {
                const sel = newAssignees.includes(p.id)
                return (
                  <button
                    key={p.id}
                    onClick={() => setNewAssignees(prev => sel ? prev.filter(id => id !== p.id) : [...prev, p.id])}
                    title={p.name ?? p.email}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '3px 8px 3px 4px', borderRadius: 12, cursor: 'pointer',
                      background: sel ? C.accentBg : 'transparent',
                      border: `1px solid ${sel ? 'rgba(124,92,252,0.35)' : C.border}`,
                    }}
                  >
                    <Initials p={p} active={sel} />
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: sel ? C.accent : C.text3 }}>
                      {(p.name ?? p.email).split(' ')[0]}
                    </span>
                  </button>
                )
              })}
            </div>

            <button
              onClick={handleCreate}
              disabled={!newTitle.trim() || creating}
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600,
                padding: '7px 16px', borderRadius: 6,
                cursor: !newTitle.trim() || creating ? 'not-allowed' : 'pointer',
                background: newTitle.trim() ? C.accent : C.surface2,
                color: newTitle.trim() ? '#fff' : C.text3,
                border: 'none', opacity: creating ? 0.6 : 1,
              }}
            >
              {creating ? 'Oppretter...' : 'Opprett oppgave'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
