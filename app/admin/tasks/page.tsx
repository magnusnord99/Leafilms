'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, useDraggable, useDroppable,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { getMyTasks, updateTaskStatus } from '@/lib/actions/pipeline'
import {
  getDailyPlanItems, addTaskToPlan, addCustomPlanItem, toggleCustomPlanItem, removePlanItem, reorderPlanItems,
} from '@/lib/actions/daily-plan'
import { PIPELINE_STAGE_LABELS_SHORT, TASK_STATUS_LABELS, type Task, type DailyPlanItem } from '@/lib/types'

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
  todo:           { label: TASK_STATUS_LABELS.todo,           color: C.text3   },
  in_progress:    { label: TASK_STATUS_LABELS.in_progress,    color: C.warning  },
  done:           { label: TASK_STATUS_LABELS.done,           color: C.success  },
  waiting_review: { label: TASK_STATUS_LABELS.waiting_review, color: C.warning  },
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

function TaskRow({ task, onStatusChange, onSettled }: {
  task: TaskWithProject
  onStatusChange: (id: string, status: 'todo' | 'in_progress' | 'done') => void
  onSettled: () => void
}) {
  const [toggling, setToggling] = useState(false)
  const isDone = task.status === 'done'
  const locked = !!task.locked
  const overdue = isOverdue(task.due_date) && !isDone
  const dateLabel = formatDate(task.due_date)
  const status = STATUS_CONFIG[task.status]
  const priority = task.priority ? PRIORITY_CONFIG[task.priority] : null
  const stageLabel = task.project ? (PIPELINE_STAGE_LABELS[task.project.pipeline_stage] ?? task.project.pipeline_stage) : null

  async function handleToggleDone() {
    if (locked) return
    setToggling(true)
    const next = isDone ? 'todo' : 'done'
    onStatusChange(task.id, next)
    await updateTaskStatus(task.id, next)
    setToggling(false)
    // Andre post-prod-steg i samme rekkefølge kan ha gått fra låst til åpent (eller omvendt) —
    // hent alt på nytt slik at deres `locked`/`blockedByTitle` alltid er ferske, ikke bare denne.
    onSettled()
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
        disabled={toggling || locked}
        title={locked ? `Venter på «${task.blockedByTitle ?? 'forrige steg'}»` : undefined}
        aria-label={isDone ? 'Marker som ikke ferdig' : 'Marker som ferdig'}
        style={{
          flexShrink: 0,
          width: 24, height: 24,
          borderRadius: 5,
          border: `2px solid ${isDone ? C.success : C.border}`,
          background: isDone ? C.success : 'transparent',
          cursor: locked ? 'not-allowed' : toggling ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
          opacity: locked ? 0.4 : toggling ? 0.5 : 1,
        }}
      >
        {isDone && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5L4 7.5L8 2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {locked && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={C.text3} strokeWidth="1.3">
            <rect x="2" y="4.3" width="6" height="4.5" rx="0.8" />
            <path d="M3.2 4.3V3a1.8 1.8 0 0 1 3.6 0v1.3" fill="none" />
          </svg>
        )}
      </button>

      {/* Task info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
          <span style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 500,
            color: isDone || locked ? C.text3 : C.text,
            textDecoration: isDone ? 'line-through' : 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {task.title}
          </span>
          {locked && (
            <span style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', fontWeight: 600,
              color: C.text3, background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${C.border}`,
              padding: '1px 6px', borderRadius: 4, flexShrink: 0,
              letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>
              Venter
            </span>
          )}
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
          {locked && task.blockedByTitle && (
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, fontStyle: 'italic' }}>
              Venter på «{task.blockedByTitle}»
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
      {!locked && (
        <span style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600,
          letterSpacing: '0.05em', textTransform: 'uppercase',
          color: status.color, background: `${status.color}14`,
          border: `1px solid ${status.color}28`,
          padding: '2px 8px', borderRadius: 4, flexShrink: 0,
        }}>
          {status.label}
        </span>
      )}
    </div>
  )
}

// --- Dagens plan --------------------------------------------------------

function planItemDone(item: DailyPlanItem): boolean {
  return item.kind === 'task' ? item.task.status === 'done' : item.done
}

function planItemTitle(item: DailyPlanItem): string {
  return item.kind === 'task' ? item.task.title : item.title
}

function planItemLocked(item: DailyPlanItem): boolean {
  return item.kind === 'task' && !!item.task.locked
}

function PlanRow({ item, onToggle, onRemove }: {
  item: DailyPlanItem
  onToggle: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({ id: item.id })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: item.id })
  const done = planItemDone(item)
  const locked = planItemLocked(item)
  const blockedByTitle = item.kind === 'task' ? item.task.blockedByTitle : null

  return (
    <div
      ref={node => { setDragRef(node); setDropRef(node) }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px', borderRadius: 7,
        background: isOver ? C.accentBg : C.surface2,
        border: `1px solid ${isOver ? 'rgba(124,92,252,0.4)' : C.border}`,
        opacity: isDragging ? 0.35 : 1,
        transform: CSS.Translate.toString(transform),
        transition: 'background 0.1s, border-color 0.1s',
      }}
    >
      <span
        {...attributes} {...listeners}
        title="Dra for å endre rekkefølge"
        style={{ cursor: 'grab', color: C.text3, flexShrink: 0, lineHeight: 0, padding: 10, margin: -10, touchAction: 'none' }}
      >
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
          <circle cx="2.5" cy="2.5" r="1.3" /><circle cx="7.5" cy="2.5" r="1.3" />
          <circle cx="2.5" cy="7" r="1.3" /><circle cx="7.5" cy="7" r="1.3" />
          <circle cx="2.5" cy="11.5" r="1.3" /><circle cx="7.5" cy="11.5" r="1.3" />
        </svg>
      </span>

      <button
        onClick={locked ? undefined : onToggle}
        disabled={locked}
        title={locked ? `Venter på «${blockedByTitle ?? 'forrige steg'}»` : undefined}
        aria-label={done ? 'Marker som ikke ferdig' : 'Marker som ferdig'}
        style={{
          flexShrink: 0, width: 24, height: 24, borderRadius: 5,
          border: `2px solid ${done ? C.success : C.border}`,
          background: done ? C.success : 'transparent',
          cursor: locked ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: locked ? 0.4 : 1,
        }}
      >
        {done && (
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
            <path d="M2 5L4 7.5L8 2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {locked && (
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke={C.text3} strokeWidth="1.3">
            <rect x="2" y="4.3" width="6" height="4.5" rx="0.8" />
            <path d="M3.2 4.3V3a1.8 1.8 0 0 1 3.6 0v1.3" fill="none" />
          </svg>
        )}
      </button>

      <span style={{
        flex: 1, minWidth: 0, fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem',
        color: done || locked ? C.text3 : C.text, textDecoration: done ? 'line-through' : 'none',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {planItemTitle(item)}
      </span>

      {locked && (
        <span style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', fontWeight: 600,
          color: C.text3, background: 'rgba(255,255,255,0.04)',
          border: `1px solid ${C.border}`,
          padding: '1px 6px', borderRadius: 4, flexShrink: 0,
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>
          Venter
        </span>
      )}

      {item.kind === 'task' && item.task.project && (
        <Link href={taskHref(item.task as TaskWithProject)} style={{ textDecoration: 'none', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.accent }}>
            {item.task.project.title}
          </span>
        </Link>
      )}

      <button
        onClick={onRemove}
        title="Fjern fra dagens plan"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, padding: 2, lineHeight: 0, flexShrink: 0 }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = C.danger }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.text3 }}
      >
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2 2l8 8M10 2L2 10" />
        </svg>
      </button>
    </div>
  )
}

function TaskPicker({ candidates, onPick, onClose }: {
  candidates: TaskWithProject[]
  onPick: (taskId: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50, width: 'min(320px, calc(100vw - 32px))', maxHeight: 280, overflowY: 'auto',
      background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', padding: 4,
    }}>
      {candidates.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, padding: '10px 12px' }}>
          Alle dine aktive oppgaver er allerede i dagens plan
        </p>
      ) : candidates.map(t => (
        <button
          key={t.id}
          onClick={() => { onPick(t.id); onClose() }}
          style={{
            width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none',
            cursor: 'pointer', borderRadius: 5, fontFamily: 'var(--font-dm-sans)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.surface }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.78rem', color: C.text }}>{t.title}</span>
            {t.locked && (
              <span style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.58rem', fontWeight: 600,
                color: C.text3, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
                padding: '0px 5px', borderRadius: 4, letterSpacing: '0.04em', textTransform: 'uppercase',
              }}>
                Venter
              </span>
            )}
          </div>
          {t.project && (
            <div style={{ fontSize: '0.68rem', color: C.text3 }}>{t.project.title}</div>
          )}
        </button>
      ))}
    </div>
  )
}

function DailyPlanPanel({ myTasks, onTaskStatusChange, onTaskStatusSettled }: {
  myTasks: TaskWithProject[]
  onTaskStatusChange: (taskId: string, status: 'todo' | 'in_progress' | 'done') => void
  onTaskStatusSettled: () => void
}) {
  const [items, setItems] = useState<DailyPlanItem[]>([])
  const [loading, setLoading] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [customTitle, setCustomTitle] = useState('')
  const [adding, setAdding] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => {
    getDailyPlanItems().then(data => { setItems(data); setLoading(false) })
  }, [])

  const planTaskIds = new Set(items.filter(i => i.kind === 'task').map(i => i.task.id))
  const candidates = myTasks.filter(t => t.status !== 'done' && !planTaskIds.has(t.id))

  // Statusen for prosjektoppgaver kan endres fra listen under (samme side) — les alltid
  // status live fra myTasks i stedet for det som ble hentet da dagsplanen sist ble lastet,
  // slik at de to listene aldri kan vise motstridende status for samme oppgave.
  const displayItems: DailyPlanItem[] = items.map(item => {
    if (item.kind !== 'task') return item
    const live = myTasks.find(t => t.id === item.task.id)
    return live
      ? { ...item, task: { ...item.task, status: live.status, locked: live.locked, blockedByTitle: live.blockedByTitle } }
      : item
  })

  async function handleAddTask(taskId: string) {
    const task = myTasks.find(t => t.id === taskId)
    if (!task) return
    const optimistic: DailyPlanItem = { id: `tmp-${taskId}`, kind: 'task', sort_order: items.length, task }
    setItems(prev => [...prev, optimistic])
    await addTaskToPlan(taskId)
    const fresh = await getDailyPlanItems()
    setItems(fresh)
  }

  async function handleAddCustom() {
    const title = customTitle.trim()
    if (!title || adding) return
    setAdding(true)
    await addCustomPlanItem(title)
    setCustomTitle('')
    const fresh = await getDailyPlanItems()
    setItems(fresh)
    setAdding(false)
  }

  async function handleToggle(item: DailyPlanItem) {
    if (item.kind === 'task') {
      const nextStatus = item.task.status === 'done' ? 'todo' : 'done'
      setItems(prev => prev.map(i => i.id === item.id && i.kind === 'task' ? { ...i, task: { ...i.task, status: nextStatus } } : i))
      onTaskStatusChange(item.task.id, nextStatus)
      await updateTaskStatus(item.task.id, nextStatus)
      // Andre post-prod-steg kan ha låst seg opp/igjen — hent alt på nytt for ferske locked-flagg.
      onTaskStatusSettled()
    } else {
      const nextDone = !item.done
      setItems(prev => prev.map(i => i.id === item.id && i.kind === 'custom' ? { ...i, done: nextDone } : i))
      await toggleCustomPlanItem(item.id, nextDone)
    }
  }

  async function handleRemove(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
    await removePlanItem(id)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const fromIndex = items.findIndex(i => i.id === active.id)
    const toIndex = items.findIndex(i => i.id === over.id)
    if (fromIndex === -1 || toIndex === -1) return
    const reordered = [...items]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)
    setItems(reordered)
    reorderPlanItems(reordered.map(i => i.id))
  }

  return (
    <div data-testid="daily-plan-panel" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '18px 18px 16px', marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.95rem', fontWeight: 600, color: C.text, marginBottom: 2 }}>
            Dagens plan
          </h2>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
            Din egen plan for arbeidsdagen — hent inn oppgaver eller legg til egne
          </p>
        </div>
      </div>

      {loading ? (
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>Laster...</p>
      ) : (
        <>
          {items.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, fontStyle: 'italic', padding: '6px 2px 14px' }}>
              Ingen oppgaver i dagens plan ennå
            </p>
          ) : (
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {displayItems.map(item => (
                  <PlanRow
                    key={item.id}
                    item={item}
                    onToggle={() => handleToggle(item)}
                    onRemove={() => handleRemove(item.id)}
                  />
                ))}
              </div>
            </DndContext>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setPickerOpen(v => !v)}
                style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600,
                  padding: '7px 12px', borderRadius: 6, cursor: 'pointer',
                  background: C.accentBg, color: C.accent, border: '1px solid rgba(124,92,252,0.25)',
                }}
              >
                + Fra mine oppgaver
              </button>
              {pickerOpen && (
                <TaskPicker candidates={candidates} onPick={handleAddTask} onClose={() => setPickerOpen(false)} />
              )}
            </div>

            <input
              value={customTitle}
              onChange={e => setCustomTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddCustom()}
              placeholder="Egen oppgave..."
              style={{
                flex: 1, minWidth: 160, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem',
                color: C.text, background: 'transparent', border: `1px solid ${C.border}`,
                borderRadius: 6, padding: '7px 10px', outline: 'none',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
              onBlur={e => { e.currentTarget.style.borderColor = C.border }}
            />
            <button
              onClick={handleAddCustom}
              disabled={!customTitle.trim() || adding}
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600,
                padding: '7px 12px', borderRadius: 6, cursor: customTitle.trim() ? 'pointer' : 'not-allowed',
                background: customTitle.trim() ? C.accentBg : 'transparent',
                color: customTitle.trim() ? C.accent : C.text3,
                border: `1px solid ${customTitle.trim() ? 'rgba(124,92,252,0.25)' : C.border}`,
              }}
            >
              + Legg til
            </button>
          </div>
        </>
      )}
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

  async function refreshTasks() {
    const fresh = await getMyTasks()
    setTasks(fresh as TaskWithProject[])
  }

  const totalCount = tasks.length
  const activeCount = tasks.filter(t => t.status !== 'done' && !t.locked).length
  const doneCount = tasks.filter(t => t.status === 'done').length
  const overdueCount = tasks.filter(t => isOverdue(t.due_date) && t.status !== 'done').length

  const filtered = tasks.filter(t => {
    if (filter === 'active') return t.status !== 'done' && !t.locked
    if (filter === 'done') return t.status === 'done'
    return true
  }).sort((a, b) => {
    // Åpne oppgaver først, låste ("venter på ...") sist — uansett forfallsdato
    const aLocked = a.locked ? 1 : 0
    const bLocked = b.locked ? 1 : 0
    if (aLocked !== bLocked) return aLocked - bLocked
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

        <DailyPlanPanel myTasks={tasks} onTaskStatusChange={handleStatusChange} onTaskStatusSettled={refreshTasks} />

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: 10, marginBottom: 28 }}>
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
                <TaskRow task={task} onStatusChange={handleStatusChange} onSettled={refreshTasks} />
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
