'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  getAdminTasks, createAdminTask, updateAdminTaskStatus, updateAdminTaskAssignee, deleteAdminTask, getAdminProfiles,
} from '@/lib/actions/admin-tasks'
import { TASK_STATUS_LABELS, TASK_STATUS_CYCLE, type AdminTask, type TaskStatus } from '@/lib/types'
import { C } from '@/lib/admin-theme'
import { getAvatarColor } from '@/lib/avatar-colors'

type Profile = { id: string; name: string | null; email: string; color: string | null }

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done']

const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: C.text3,
  in_progress: '#F0A500',
  done: '#4CAF7D',
  waiting_review: '#F0A500',
}

function Avatar({ id, name, color, size = 24 }: { id: string; name: string | null; color?: string | null; size?: number }) {
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

function AssigneePicker({
  task, profiles, onAssign,
}: {
  task: AdminTask
  profiles: Profile[]
  onAssign: (profileId: string | null) => void
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
    <div ref={ref} style={{ position: 'relative', flexShrink: 0, lineHeight: 0 }}>
      <button
        onClick={() => setOpen(v => !v)}
        title={task.assignee ? task.assignee.name ?? task.assignee.email : 'Tildel'}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 0 }}
      >
        {task.assignee ? (
          <Avatar id={task.assignee.id} name={task.assignee.name} color={task.assignee.color} size={22} />
        ) : (
          <span style={{
            width: 22, height: 22, borderRadius: '50%', boxSizing: 'border-box',
            border: `1.5px dashed ${C.text3}`, color: C.text3,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600,
          }}>
            +
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 50,
          background: C.surface2, border: `1px solid ${C.border}`,
          borderRadius: 8, minWidth: 190, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          padding: '4px 0',
        }}>
          {task.assignee && (
            <>
              <button
                onClick={() => { setOpen(false); onAssign(null) }}
                style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}
              >
                Fjern tildeling
              </button>
              <div style={{ height: 1, background: C.border }} />
            </>
          )}
          {profiles.map(p => (
            <button
              key={p.id}
              onClick={() => { setOpen(false); onAssign(p.id) }}
              style={{
                width: '100%', textAlign: 'left', padding: '7px 12px',
                background: p.id === task.assignee?.id ? `${C.accent}14` : 'none',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-dm-sans)',
              }}
            >
              <Avatar id={p.id} name={p.name} color={p.color} size={18} />
              <span style={{ fontSize: '0.78rem', color: C.text, fontWeight: p.id === task.assignee?.id ? 600 : 400 }}>{p.name ?? p.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectLink({ project }: { project: AdminTask['project'] }) {
  if (!project) return null
  return (
    <Link
      href={`/admin/projects/${project.id}`}
      onClick={e => e.stopPropagation()}
      style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.66rem', color: C.text3, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}
      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = C.accent }}
      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = C.text3 }}
    >
      ↗ {project.title}
    </Link>
  )
}

function TaskRow({
  task, profiles, onStatusChange, onAssign, onDelete,
}: {
  task: AdminTask
  profiles: Profile[]
  onStatusChange: () => void
  onAssign: (profileId: string | null) => void
  onDelete: () => void
}) {
  const [deleting, setDeleting] = useState(false)

  return (
    <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 7, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <button
        onClick={onStatusChange}
        style={{
          flexShrink: 0, width: 24, height: 24, borderRadius: 5, cursor: 'pointer', padding: 0,
          background: task.status === 'done' ? 'rgba(76,175,125,0.18)' : task.status === 'in_progress' ? 'rgba(240,165,0,0.12)' : 'transparent',
          border: `1.5px solid ${STATUS_COLOR[task.status]}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s',
        }}
      >
        {task.status === 'done' && (
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M2 5.5L4.5 8L9 3" stroke={STATUS_COLOR.done} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {task.status === 'in_progress' && (
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR.in_progress }} />
        )}
      </button>

      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: task.status === 'done' ? C.text3 : C.text, textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>
          {task.title}
        </span>
        <ProjectLink project={task.project} />
      </span>

      <AssigneePicker task={task} profiles={profiles} onAssign={onAssign} />

      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.04em', color: STATUS_COLOR[task.status], flexShrink: 0 }}>
        {TASK_STATUS_LABELS[task.status]}
      </span>

      <button
        onClick={() => { setDeleting(true); onDelete() }}
        disabled={deleting}
        title="Slett oppgave"
        style={{ background: 'none', border: 'none', cursor: deleting ? 'wait' : 'pointer', color: C.text3, padding: 2, lineHeight: 0, opacity: deleting ? 0.5 : 1, transition: 'color 0.12s' }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#E05555' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.text3 }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2 2l8 8M10 2L2 10" />
        </svg>
      </button>
    </div>
  )
}

function DraggableCard({
  task, profiles, onAssign, onDelete, onStatusChange, isDragOverlay = false,
}: {
  task: AdminTask
  profiles: Profile[]
  onAssign: (profileId: string | null) => void
  onDelete: () => void
  onStatusChange: () => void
  isDragOverlay?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id })

  const style: React.CSSProperties = isDragOverlay
    ? {
        background: C.surface2, border: `1px solid rgba(124,92,252,0.35)`, borderRadius: 7,
        padding: '10px 12px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)', cursor: 'grabbing', width: 220,
      }
    : {
        background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 7,
        padding: '10px 12px', opacity: isDragging ? 0.4 : 1,
        transition: 'opacity 0.15s', transform: CSS.Translate.toString(transform),
      }

  return (
    <div ref={isDragOverlay ? undefined : setNodeRef} style={style} {...(isDragOverlay ? {} : { ...attributes, ...listeners })}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text, lineHeight: 1.35 }}>
            {task.title}
          </span>
          {!isDragOverlay && <ProjectLink project={task.project} />}
        </span>
        {!isDragOverlay && (
          <button
            onClick={onDelete}
            title="Slett oppgave"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, padding: 2, lineHeight: 0, flexShrink: 0 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#E05555' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.text3 }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 2l8 8M10 2L2 10" />
            </svg>
          </button>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {!isDragOverlay ? (
          <button
            onClick={e => { e.stopPropagation(); onStatusChange() }}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600, color: STATUS_COLOR[task.status],
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            → {TASK_STATUS_LABELS[TASK_STATUS_CYCLE[task.status]]}
          </button>
        ) : <span />}
        {!isDragOverlay && <AssigneePicker task={task} profiles={profiles} onAssign={onAssign} />}
      </div>
    </div>
  )
}

function DroppableColumn({
  status, tasks, profiles, onAssign, onDelete, onStatusChange,
}: {
  status: TaskStatus
  tasks: AdminTask[]
  profiles: Profile[]
  onAssign: (taskId: string, profileId: string | null) => void
  onDelete: (taskId: string) => void
  onStatusChange: (task: AdminTask) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[status] }} />
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.text2 }}>
          {TASK_STATUS_LABELS[status]}
        </span>
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        style={{
          display: 'flex', flexDirection: 'column', gap: 8, minHeight: 80,
          background: isOver ? `${C.accent}0a` : 'transparent',
          border: `1px dashed ${isOver ? C.accent : 'transparent'}`,
          borderRadius: 8, padding: 4, transition: 'background 0.12s, border-color 0.12s',
        }}
      >
        {tasks.map(task => (
          <DraggableCard
            key={task.id}
            task={task}
            profiles={profiles}
            onAssign={profileId => onAssign(task.id, profileId)}
            onDelete={() => onDelete(task.id)}
            onStatusChange={() => onStatusChange(task)}
          />
        ))}
        {tasks.length === 0 && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, fontStyle: 'italic', padding: '4px 2px' }}>
            Ingen oppgaver
          </p>
        )}
      </div>
    </div>
  )
}

function AddTaskInput({ value, onChange, onSubmit, disabled }: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  disabled: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onSubmit()}
        placeholder="Legg til oppgave..."
        style={{
          flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem',
          color: C.text, background: 'transparent', border: `1px solid ${C.border}`,
          borderRadius: 6, padding: '7px 10px', outline: 'none', transition: 'border-color 0.12s',
        }}
        onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
        onBlur={e => { e.currentTarget.style.borderColor = C.border }}
      />
      <button
        onClick={onSubmit}
        disabled={!value.trim() || disabled}
        style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600,
          padding: '7px 12px', borderRadius: 6, cursor: value.trim() ? 'pointer' : 'not-allowed',
          background: value.trim() ? C.accentBg : 'transparent',
          color: value.trim() ? C.accent : C.text3,
          border: `1px solid ${value.trim() ? 'rgba(124,92,252,0.25)' : C.border}`,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        + Legg til
      </button>
    </div>
  )
}

export default function InternalTasksPage() {
  const [tasks, setTasks] = useState<AdminTask[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'board'>('list')
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [activeTask, setActiveTask] = useState<AdminTask | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  useEffect(() => {
    Promise.all([getAdminTasks(), getAdminProfiles()]).then(([t, p]) => {
      setTasks(t)
      setProfiles(p)
      setLoading(false)
    })
  }, [])

  async function handleAddTask() {
    const title = newTitle.trim()
    if (!title || creating) return
    setCreating(true)
    const created = await createAdminTask(title)
    if (created) {
      setTasks(prev => [...prev, created])
      setNewTitle('')
    }
    setCreating(false)
  }

  function handleStatusChange(task: AdminTask, status?: TaskStatus) {
    const next = status ?? TASK_STATUS_CYCLE[task.status]
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t))
    updateAdminTaskStatus(task.id, next)
  }

  async function handleAssign(taskId: string, profileId: string | null) {
    const prevTasks = tasks
    const profile = profileId ? profiles.find(p => p.id === profileId) ?? null : null
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, assignee: profile } : t))
    const result = await updateAdminTaskAssignee(taskId, profileId)
    if (!result.ok) {
      setTasks(prevTasks)
      alert(result.error ?? 'Kunne ikke tildele oppgaven')
    }
  }

  async function handleDelete(taskId: string) {
    setTasks(prev => prev.filter(t => t.id !== taskId))
    await deleteAdminTask(taskId)
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveTask(tasks.find(t => t.id === event.active.id) ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveTask(null)
    const targetStatus = over?.id as TaskStatus | undefined
    const task = tasks.find(t => t.id === active.id)
    if (!targetStatus || !task || task.status === targetStatus) return
    handleStatusChange(task, targetStatus)
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '28px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-cormorant)', fontSize: '1.6rem', fontWeight: 600, color: C.text, marginBottom: 4 }}>
            Interne oppgaver
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>
            Admin-ting uten prosjekttilknytning
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 3 }}>
          {(['list', 'board'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600,
                padding: '6px 14px', borderRadius: 6, cursor: 'pointer', border: 'none',
                background: view === v ? C.accentBg : 'transparent',
                color: view === v ? C.accent : C.text3,
              }}
            >
              {v === 'list' ? 'Liste' : 'Board'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text3 }}>Laster...</p>
      ) : view === 'list' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 720 }}>
          {tasks.length === 0 && (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, fontStyle: 'italic', padding: '4px 0' }}>
              Ingen interne oppgaver ennå.
            </p>
          )}
          {tasks.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              profiles={profiles}
              onStatusChange={() => handleStatusChange(task)}
              onAssign={profileId => handleAssign(task.id, profileId)}
              onDelete={() => handleDelete(task.id)}
            />
          ))}
          <div style={{ marginTop: 4 }}>
            <AddTaskInput value={newTitle} onChange={setNewTitle} onSubmit={handleAddTask} disabled={creating} />
          </div>
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            {STATUSES.map(status => (
              <DroppableColumn
                key={status}
                status={status}
                tasks={tasks.filter(t => t.status === status)}
                profiles={profiles}
                onAssign={handleAssign}
                onDelete={handleDelete}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask && (
              <DraggableCard task={activeTask} profiles={profiles} onAssign={() => {}} onDelete={() => {}} onStatusChange={() => {}} isDragOverlay />
            )}
          </DragOverlay>
        </DndContext>
      )}

      {view === 'board' && !loading && (
        <div style={{ marginTop: 24, maxWidth: 400 }}>
          <AddTaskInput value={newTitle} onChange={setNewTitle} onSubmit={handleAddTask} disabled={creating} />
        </div>
      )}
    </div>
  )
}
