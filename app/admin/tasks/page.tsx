'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getMyTasks, updateTaskStatus } from '@/lib/actions/pipeline'
import { PIPELINE_STAGE_LABELS_SHORT, TASK_STATUS_LABELS, type Task } from '@/lib/types'

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

type TaskWithProject = Task & {
  project: {
    id: string
    title: string
    pipeline_stage: string
    customer: { name: string; company: string | null } | null
  } | null
}

type Filter = 'all' | 'active' | 'done'

const PIPELINE_STAGE_LABELS: Record<string, string> = PIPELINE_STAGE_LABELS_SHORT

const PRIORITY_CONFIG = {
  high:   { label: 'Høy',    color: C.danger  },
  medium: { label: 'Medium', color: C.warning  },
  low:    { label: 'Lav',    color: C.text3   },
}

const STATUS_CONFIG = {
  todo:        { label: TASK_STATUS_LABELS.todo,        color: C.text3   },
  in_progress: { label: TASK_STATUS_LABELS.in_progress, color: C.warning  },
  done:        { label: TASK_STATUS_LABELS.done,        color: C.success  },
}

function taskHref(task: TaskWithProject): string {
  if (!task.project) return '/admin/projects'
  if (task.project.pipeline_stage === 'post_prod') {
    return `/admin/postprod/${task.project.id}?task=${task.id}`
  }
  if (task.project.pipeline_stage === 'pre_prod') {
    return `/admin/preprod/${task.project.id}?task=${task.id}`
  }
  return `/admin/projects/${task.project.id}?task=${task.id}`
}

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return `Forfalt ${Math.abs(diffDays)}d siden`
  if (diffDays === 0) return 'I dag'
  if (diffDays === 1) return 'I morgen'
  return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })
}

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false
  return new Date(dateStr) < new Date(new Date().toDateString())
}

function TaskRow({ task, onStatusChange }: {
  task: TaskWithProject
  onStatusChange: (id: string, status: 'todo' | 'in_progress' | 'done') => void
}) {
  const [toggling, setToggling] = useState(false)
  const isDone = task.status === 'done'
  const overdue = isOverdue(task.due_date) && !isDone
  const dateLabel = formatDate(task.due_date)
  const status = STATUS_CONFIG[task.status]
  const priority = task.priority ? PRIORITY_CONFIG[task.priority] : null
  const stageLabel = task.project ? (PIPELINE_STAGE_LABELS[task.project.pipeline_stage] ?? task.project.pipeline_stage) : null

  async function handleToggleDone() {
    setToggling(true)
    const next = isDone ? 'todo' : 'done'
    onStatusChange(task.id, next)
    await updateTaskStatus(task.id, next)
    setToggling(false)
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 16px',
      borderBottom: `1px solid ${C.border}`,
      background: C.surface,
      transition: 'background 0.1s',
      opacity: isDone ? 0.6 : 1,
    }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = C.surface2}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = C.surface}
    >
      {/* Toggle checkbox */}
      <button
        onClick={handleToggleDone}
        disabled={toggling}
        aria-label={isDone ? 'Marker som ikke ferdig' : 'Marker som ferdig'}
        style={{
          flexShrink: 0,
          width: 20, height: 20,
          borderRadius: 5,
          border: `2px solid ${isDone ? C.success : C.border}`,
          background: isDone ? C.success : 'transparent',
          cursor: toggling ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
          opacity: toggling ? 0.5 : 1,
        }}
      >
        {isDone && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5L4 7.5L8 2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Task info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
          <span style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 500,
            color: isDone ? C.text3 : C.text,
            textDecoration: isDone ? 'line-through' : 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {task.title}
          </span>
          {priority && (
            <span style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', fontWeight: 600,
              color: priority.color, background: `${priority.color}18`,
              border: `1px solid ${priority.color}30`,
              padding: '1px 6px', borderRadius: 4, flexShrink: 0,
              letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>
              {priority.label}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {task.project && (
            <Link href={taskHref(task)} style={{ textDecoration: 'none' }}>
              <span style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.accent,
                cursor: 'pointer',
              }}
                onMouseEnter={e => (e.currentTarget as HTMLSpanElement).style.textDecoration = 'underline'}
                onMouseLeave={e => (e.currentTarget as HTMLSpanElement).style.textDecoration = 'none'}
              >
                {task.project.title}
                {task.project.customer?.name && ` · ${task.project.customer.name}`}
              </span>
            </Link>
          )}
          {stageLabel && (
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>
              {stageLabel}
            </span>
          )}
        </div>
      </div>

      {/* Due date */}
      {dateLabel && (
        <span style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', flexShrink: 0,
          color: overdue ? C.danger : C.text3,
          fontWeight: overdue ? 600 : 400,
        }}>
          {dateLabel}
        </span>
      )}

      {/* Status badge */}
      <span style={{
        fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600,
        letterSpacing: '0.05em', textTransform: 'uppercase',
        color: status.color, background: `${status.color}14`,
        border: `1px solid ${status.color}28`,
        padding: '2px 8px', borderRadius: 4, flexShrink: 0,
      }}>
        {status.label}
      </span>
    </div>
  )
}

export default function MyTasksPage() {
  const [tasks, setTasks] = useState<TaskWithProject[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('active')

  useEffect(() => {
    getMyTasks().then(data => {
      setTasks(data as TaskWithProject[])
      setLoading(false)
    })
  }, [])

  function handleStatusChange(taskId: string, status: 'todo' | 'in_progress' | 'done') {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t))
  }

  const totalCount = tasks.length
  const activeCount = tasks.filter(t => t.status !== 'done').length
  const doneCount = tasks.filter(t => t.status === 'done').length
  const overdueCount = tasks.filter(t => isOverdue(t.due_date) && t.status !== 'done').length

  const filtered = tasks.filter(t => {
    if (filter === 'active') return t.status !== 'done'
    if (filter === 'done') return t.status === 'done'
    return true
  }).sort((a, b) => {
    // Sort: overdue first, then by due_date, then by sort_order
    const aOverdue = isOverdue(a.due_date) && a.status !== 'done' ? 0 : 1
    const bOverdue = isOverdue(b.due_date) && b.status !== 'done' ? 0 : 1
    if (aOverdue !== bOverdue) return aOverdue - bOverdue
    if (a.status === 'done' && b.status !== 'done') return 1
    if (a.status !== 'done' && b.status === 'done') return -1
    if (a.status === 'in_progress' && b.status !== 'in_progress') return -1
    if (a.status !== 'in_progress' && b.status === 'in_progress') return 1
    if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    if (a.due_date) return -1
    if (b.due_date) return 1
    return a.sort_order - b.sort_order
  })

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>Laster...</p>
      </div>
    )
  }

  const stats = [
    { label: 'Tildelt totalt', value: totalCount },
    { label: 'Aktive',         value: activeCount,  highlight: activeCount > 0 },
    { label: 'Forfalt',        value: overdueCount, danger: overdueCount > 0 },
    { label: 'Ferdig',         value: doneCount,    success: doneCount > 0 },
  ]

  const filters: { value: Filter; label: string; count: number }[] = [
    { value: 'active', label: 'Aktive',      count: activeCount },
    { value: 'all',    label: 'Alle',        count: totalCount  },
    { value: 'done',   label: 'Ferdig',      count: doneCount   },
  ]

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '32px 32px 48px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.5rem', fontWeight: 600, color: C.text, lineHeight: 1.2, marginBottom: 4 }}>
            Mine oppgaver
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3 }}>
            Oppgaver tildelt deg på tvers av alle prosjekter
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 28 }}>
          {stats.map(s => (
            <div key={s.label} style={{
              background: C.surface,
              border: `1px solid ${'danger' in s && s.danger ? 'rgba(224,85,85,0.35)' : C.border}`,
              borderRadius: 8, padding: '14px 18px',
            }}>
              <p style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '1.5rem', fontWeight: 700, lineHeight: 1, marginBottom: 4,
                color: 'danger' in s && s.danger ? C.danger : 'success' in s && s.success ? C.success : 'highlight' in s && s.highlight ? C.accent : C.text,
              }}>
                {s.value}
              </p>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: `1px solid ${C.border}`, paddingBottom: 0 }}>
          {filters.map(f => {
            const isActive = filter === f.value
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: isActive ? 600 : 400,
                  padding: '8px 14px', background: 'none', border: 'none',
                  borderBottom: `2px solid ${isActive ? C.accent : 'transparent'}`,
                  color: isActive ? C.text : C.text3,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
                  marginBottom: -1, transition: 'color 0.1s',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = C.text2 }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = C.text3 }}
              >
                {f.label}
                <span style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 700,
                  padding: '0px 5px', borderRadius: 8,
                  background: isActive ? C.accentBg : 'rgba(255,255,255,0.06)',
                  color: isActive ? C.accent : C.text3,
                  border: `1px solid ${isActive ? 'rgba(124,92,252,0.25)' : C.border}`,
                }}>
                  {f.count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Task list */}
        {filtered.length === 0 ? (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '64px 24px', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.9rem', fontWeight: 500, color: C.text3, marginBottom: 6 }}>
              {filter === 'done' ? 'Ingen fullførte oppgaver ennå' : 'Ingen oppgaver tildelt deg'}
            </p>
            {filter === 'active' && (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>
                Oppgaver tildelt deg i Pipeline eller Post-prod vises her
              </p>
            )}
          </div>
        ) : (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
            {filtered.map((task, i) => (
              <div key={task.id} style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <TaskRow task={task} onStatusChange={handleStatusChange} />
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
