'use client'

import { useState } from 'react'
import { toggleTaskAssignee, createTask, deleteTask } from '@/lib/actions/pipeline'
import { updateTaskDueDate } from '@/lib/actions/calendar'
import { TASK_STATUS_LABELS, TASK_STATUS_CYCLE, type Task, type PipelineStage } from '@/lib/types'
import { TaskChatToggle } from '@/components/task/TaskChatToggle'
import { getAvatarColor } from '@/lib/avatar-colors'

const C = {
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

export function TaskList({
  tasks, profiles, onStatusChange, currentUserId, messageCounts, deepLinkTaskId,
  projectId, pipelineStage, onTaskCreated, onTaskDeleted, onAssigneesChange, onDueDateChange, emptyLabel,
}: {
  tasks: Task[]
  profiles: { id: string; name: string | null; email: string; color: string | null }[]
  onStatusChange: (taskId: string, status: Task['status']) => void
  currentUserId: string | null
  messageCounts: Record<string, number>
  deepLinkTaskId: string | null
  projectId: string
  pipelineStage: PipelineStage
  onTaskCreated: (task: Task) => void
  onTaskDeleted: (taskId: string) => void
  onAssigneesChange: (taskId: string, assignees: Task['assignees']) => void
  onDueDateChange: (taskId: string, dueDate: string | null) => void
  emptyLabel?: string
}) {
  const [pickerOpenId, setPickerOpenId] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleAssigneeToggle(taskId: string, profileId: string) {
    setToggling(profileId)
    const added = await toggleTaskAssignee(taskId, profileId)
    const task = tasks.find(t => t.id === taskId)
    const profile = profiles.find(p => p.id === profileId)
    if (task && profile) {
      const newAssignees = added
        ? [...task.assignees, { id: profile.id, name: profile.name, email: profile.email }]
        : task.assignees.filter(a => a.id !== profileId)
      onAssigneesChange(taskId, newAssignees)
    }
    setToggling(null)
  }

  async function handleDueDateChange(taskId: string, value: string) {
    const dueDate = value || null
    onDueDateChange(taskId, dueDate)
    await updateTaskDueDate(taskId, dueDate)
  }

  async function handleAddTask() {
    const title = newTitle.trim()
    if (!title || creating) return
    setCreating(true)
    const created = await createTask({ project_id: projectId, pipeline_stage: pipelineStage, title })
    if (created) {
      onTaskCreated(created)
      setNewTitle('')
    }
    setCreating(false)
  }

  async function handleDeleteTask(taskId: string) {
    setDeletingId(taskId)
    const result = await deleteTask(taskId)
    if (result.ok) onTaskDeleted(taskId)
    setDeletingId(null)
  }

  const STATUS_CYCLE = TASK_STATUS_CYCLE

  const STATUS_STYLE: Record<Task['status'], { label: string; color: string }> = {
    todo:           { label: TASK_STATUS_LABELS.todo,           color: C.text3   },
    in_progress:    { label: TASK_STATUS_LABELS.in_progress,    color: C.warning  },
    done:           { label: TASK_STATUS_LABELS.done,           color: C.success  },
    waiting_review: { label: TASK_STATUS_LABELS.waiting_review, color: C.warning  },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {tasks.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, fontStyle: 'italic', padding: '4px 0' }}>
          {emptyLabel ?? 'Ingen oppgaver funnet for dette steget.'}
        </p>
      ) : (
        tasks.map(task => {
          const s = STATUS_STYLE[task.status]
          const isOpen = pickerOpenId === task.id
          const assignedIds = new Set(task.assignees.map(a => a.id))

          return (
            <div key={task.id} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 7, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', flexWrap: 'wrap' }}>
                {/* Status toggle */}
                <button
                  onClick={() => onStatusChange(task.id, STATUS_CYCLE[task.status])}
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

                {/* Frist */}
                <input
                  type="date"
                  value={task.due_date ?? ''}
                  onChange={e => handleDueDateChange(task.id, e.target.value)}
                  title="Frist"
                  style={{
                    fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem',
                    color: task.due_date ? C.text2 : C.text3, background: C.surface,
                    border: `1px solid ${C.border}`, borderRadius: 6,
                    padding: '3px 6px', outline: 'none', flexShrink: 0,
                    colorScheme: 'dark',
                  }}
                />

                <TaskChatToggle
                  taskId={task.id}
                  taskTitle={task.title}
                  currentUserId={currentUserId}
                  profiles={profiles}
                  messageCount={messageCounts[task.id] ?? 0}
                  forceOpen={deepLinkTaskId === task.id}
                />

                {task.is_custom && (
                  <button
                    onClick={() => handleDeleteTask(task.id)}
                    disabled={deletingId === task.id}
                    title="Slett oppgave"
                    style={{
                      background: 'none', border: 'none', cursor: deletingId === task.id ? 'wait' : 'pointer',
                      color: C.text3, padding: 2, lineHeight: 0, transition: 'color 0.12s', flexShrink: 0,
                      opacity: deletingId === task.id ? 0.5 : 1,
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = C.danger }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.text3 }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M2 2l8 8M10 2L2 10" />
                    </svg>
                  </button>
                )}
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
        })
      )}

      {/* Legg til oppgave */}
      <div style={{ display: 'flex', gap: 8, marginTop: tasks.length > 0 ? 4 : 0 }}>
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAddTask()}
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
          onClick={handleAddTask}
          disabled={!newTitle.trim() || creating}
          style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600,
            padding: '7px 12px', borderRadius: 6, cursor: newTitle.trim() ? 'pointer' : 'not-allowed',
            background: newTitle.trim() ? C.accentBg : 'transparent',
            color: newTitle.trim() ? C.accent : C.text3,
            border: `1px solid ${newTitle.trim() ? 'rgba(124,92,252,0.25)' : C.border}`,
            transition: 'all 0.12s', opacity: creating ? 0.6 : 1,
          }}
        >
          + Legg til
        </button>
      </div>
    </div>
  )
}
