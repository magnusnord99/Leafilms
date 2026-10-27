'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getMyTasks } from '@/lib/actions/pipeline'
import { getMyInternalTasks } from '@/lib/actions/admin-tasks'
import { TASK_STATUS_LABELS, type TaskStatus } from '@/lib/types'
import { C } from '@/lib/admin-theme'
import { WidgetHeader, Btn } from '../shared'
import { getStageHref } from '@/lib/pipeline-stage-nav'

type MyTaskItem = {
  id: string
  title: string
  subtitle: string
  dueDate: string | null
  status: TaskStatus
  href: string
}

export default function MyTasksWidget() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<MyTaskItem[]>([])

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    try {
      const [projectTasks, internalTasks] = await Promise.all([getMyTasks(), getMyInternalTasks()])

      const fromProjects: MyTaskItem[] = projectTasks
        .filter((t) => t.status !== 'done')
        .map((t) => ({
          id: t.id,
          title: t.title,
          subtitle: t.project.title,
          dueDate: t.due_date,
          status: t.status,
          href: getStageHref(t.project.id, t.project.pipeline_stage),
        }))

      const fromInternal: MyTaskItem[] = internalTasks
        .filter((t) => t.status !== 'done')
        .map((t) => ({
          id: t.id,
          title: t.title,
          subtitle: 'Intern oppgave',
          dueDate: t.due_date,
          status: t.status,
          href: '/admin/internal',
        }))

      const merged = [...fromProjects, ...fromInternal].sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return a.dueDate.localeCompare(b.dueDate)
      })

      setItems(merged)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return null

  const todayKey = new Date().toISOString().slice(0, 10)
  const visible = items.slice(0, 6)

  return (
    <div>
      <WidgetHeader title="Mine oppgaver" action={<Btn href="/admin/tasks" variant="ghost">Se alle →</Btn>} />
      {items.length === 0 ? (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '24px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>Ingen åpne oppgaver</p>
        </div>
      ) : (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {visible.map((item, i) => {
            const overdue = !!item.dueDate && item.dueDate < todayKey
            return (
              <Link key={item.id} href={item.href} style={{ textDecoration: 'none' }}>
                <div
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    padding: '10px 14px', background: C.surface,
                    borderBottom: i < visible.length - 1 ? `1px solid ${C.border}` : 'none',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget as HTMLDivElement).style.background = C.surface2}
                  onMouseLeave={(e) => (e.currentTarget as HTMLDivElement).style.background = C.surface}
                >
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 500, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.title}
                    </p>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.subtitle} · {TASK_STATUS_LABELS[item.status]}
                    </p>
                  </div>
                  {item.dueDate && (
                    <span style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 500, flexShrink: 0,
                      color: overdue ? C.danger : C.text3,
                    }}>
                      {new Date(`${item.dueDate}T00:00:00`).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
