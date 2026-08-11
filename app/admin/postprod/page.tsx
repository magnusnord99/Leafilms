'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getPostProdProjects, getPostProdAssignedTasks } from '@/lib/actions/pipeline'
import { TASK_STATUS_LABELS, type ProjectWithPipeline, type Task } from '@/lib/types'

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
}

type PostProdProject = ProjectWithPipeline & { task_count: number; done_count: number }

type AssignedTaskRow = {
  task: Task
  projectId: string
  projectTitle: string
  customerName: string | null
}

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  video: { label: 'Video', color: '#7C5CFC' },
  photo: { label: 'Foto',  color: '#4A9AC4' },
  mixed: { label: 'Begge', color: '#4CAF7D' },
}

const STATUS_CONFIG = {
  todo:           { label: TASK_STATUS_LABELS.todo,           color: C.text3   },
  in_progress:    { label: TASK_STATUS_LABELS.in_progress,    color: C.warning  },
  done:           { label: TASK_STATUS_LABELS.done,           color: C.success  },
  waiting_review: { label: TASK_STATUS_LABELS.waiting_review, color: C.warning  },
}

function ProjectCard({ project }: { project: PostProdProject }) {
  const type = project.project_type ? TYPE_CONFIG[project.project_type] : null
  const pct = project.task_count > 0 ? Math.round((project.done_count / project.task_count) * 100) : 0
  const isComplete = pct === 100 && project.task_count > 0

  return (
    <Link href={`/admin/postprod/${project.id}`} style={{ textDecoration: 'none' }}>
      <div
        style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '18px 20px', cursor: 'pointer', transition: 'border-color 0.12s', display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}
        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#3D3D4E'}
        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.border}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.9rem', fontWeight: 600, color: C.text, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {project.title}
            </p>
            {project.customer && (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {project.customer.name}{project.customer.company ? ` · ${project.customer.company}` : ''}
              </p>
            )}
          </div>
          {type && (
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: type.color, background: `${type.color}18`, border: `1px solid ${type.color}30`, padding: '3px 8px', borderRadius: 4, flexShrink: 0 }}>
              {type.label}
            </span>
          )}
        </div>

        <div style={{ marginTop: 'auto' }}>
          {project.task_count > 0 ? (
            <div>
              <div style={{ height: 4, background: C.surface2, borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: isComplete ? C.success : C.accent, borderRadius: 2, transition: 'width 0.3s' }} />
              </div>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: isComplete ? C.success : C.text3 }}>
                {project.done_count} av {project.task_count} oppgaver ferdig
              </p>
            </div>
          ) : (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, fontStyle: 'italic' }}>
              Ingen oppgaver — velg innholdstype i Pipeline
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}

function TeamOverview({ rows }: { rows: AssignedTaskRow[] }) {
  if (rows.length === 0) return null

  // Group by assignee — each task can have multiple assignees
  const byPerson = new Map<string, { name: string; email: string; tasks: AssignedTaskRow[] }>()
  for (const row of rows) {
    for (const a of row.task.assignees) {
      if (!byPerson.has(a.id)) {
        byPerson.set(a.id, { name: a.name ?? a.email, email: a.email, tasks: [] })
      }
      byPerson.get(a.id)!.tasks.push(row)
    }
  }

  const persons = Array.from(byPerson.entries()).sort(([, a], [, b]) => a.name.localeCompare(b.name))

  return (
    <div style={{ marginTop: 40 }}>
      <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
        Tildelte oppgaver — teamoversikt
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {persons.map(([id, person]) => {
          const active = person.tasks.filter(r => r.task.status !== 'done')
          const done = person.tasks.filter(r => r.task.status === 'done')
          return (
            <div key={id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
              {/* Person header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: `1px solid ${C.border}` }}>
                <span style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: C.accentBg, border: '1px solid rgba(124,92,252,0.25)',
                  color: C.accent,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 700,
                }}>
                  {person.name[0].toUpperCase()}
                </span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, color: C.text, lineHeight: 1 }}>{person.name}</p>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginTop: 2 }}>{person.email}</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: active.length > 0 ? C.accent : C.text3, background: active.length > 0 ? C.accentBg : 'transparent', border: `1px solid ${active.length > 0 ? 'rgba(124,92,252,0.25)' : C.border}`, padding: '2px 8px', borderRadius: 10, fontWeight: 500 }}>
                    {active.length} aktive
                  </span>
                  {done.length > 0 && (
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.success, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.2)', padding: '2px 8px', borderRadius: 10, fontWeight: 500 }}>
                      {done.length} ferdig
                    </span>
                  )}
                </div>
              </div>

              {/* Task rows */}
              <div>
                {person.tasks.map((row, i) => {
                  const status = STATUS_CONFIG[row.task.status]
                  const isDone = row.task.status === 'done'
                  return (
                    <Link
                      key={`${id}-${row.task.id}`}
                      href={`/admin/postprod/${row.projectId}`}
                      style={{ textDecoration: 'none', display: 'block' }}
                    >
                      <div
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '9px 18px 9px 62px',
                          borderBottom: i < person.tasks.length - 1 ? `1px solid ${C.border}` : 'none',
                          opacity: isDone ? 0.55 : 1,
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = C.surface2}
                        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
                      >
                        {/* Done indicator */}
                        <div style={{
                          width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                          border: `1.5px solid ${isDone ? C.success : status.color === C.warning ? C.warning : C.border}`,
                          background: isDone ? 'rgba(76,175,125,0.15)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {isDone && (
                            <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
                              <path d="M1 3.5L2.8 5.5L6 1.5" stroke={C.success} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>

                        {/* Task title */}
                        <span style={{
                          fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem',
                          color: isDone ? C.text3 : C.text,
                          textDecoration: isDone ? 'line-through' : 'none',
                          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {row.task.title}
                        </span>

                        {/* Project name */}
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                          {row.projectTitle}{row.customerName ? ` · ${row.customerName}` : ''}
                        </span>

                        {/* Status badge */}
                        <span style={{
                          fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600,
                          letterSpacing: '0.05em', textTransform: 'uppercase',
                          color: status.color, background: `${status.color}14`,
                          border: `1px solid ${status.color}28`,
                          padding: '2px 7px', borderRadius: 4, flexShrink: 0,
                        }}>
                          {status.label}
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function PostProdOverviewPage() {
  const [projects, setProjects] = useState<PostProdProject[]>([])
  const [assignedTasks, setAssignedTasks] = useState<AssignedTaskRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getPostProdProjects(),
      getPostProdAssignedTasks(),
    ]).then(([projs, tasks]) => {
      setProjects(projs as PostProdProject[])
      setAssignedTasks(tasks)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>Laster...</p>
      </div>
    )
  }

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '32px 32px 48px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 32 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.5rem', fontWeight: 600, color: C.text, lineHeight: 1.2, marginBottom: 4 }}>
              Post-produksjon
            </h1>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>
              {projects.length > 0 ? `${projects.length} aktive prosjekt${projects.length !== 1 ? 'er' : ''}` : 'Ingen aktive prosjekter'}
            </p>
          </div>
          <Link href="/admin/pipeline">
            <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: C.surface2, color: C.text2, border: `1px solid ${C.border}` }}>
              ← Pipeline
            </button>
          </Link>
        </div>

        {projects.length === 0 ? (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '64px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', fontWeight: 500, color: C.text3 }}>
              Ingen prosjekter i post-produksjon
            </p>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, textAlign: 'center' }}>
              Flytt et prosjekt til Post-produksjon i Pipeline for å starte
            </p>
            <Link href="/admin/pipeline">
              <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, padding: '7px 14px', borderRadius: 6, cursor: 'pointer', background: C.accent, color: '#fff', border: 'none', marginTop: 8 }}>
                Åpne Pipeline
              </button>
            </Link>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {projects.map(p => <ProjectCard key={p.id} project={p} />)}
            </div>

            <TeamOverview rows={assignedTasks} />
          </>
        )}
      </div>
    </div>
  )
}
