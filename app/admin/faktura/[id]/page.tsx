'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getProjectHub, setInvoiceAssignee, updatePipelineStage } from '@/lib/actions/pipeline'
import { getPreprodDetail } from '@/lib/actions/preprod'
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
  success:  '#4CAF7D',
  danger:   '#E05555',
}

function Avatar({ id, name, color, size = 28 }: { id: string; name: string | null; color?: string | null; size?: number }) {
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

type Profile = { id: string; name: string | null; email: string; color: string | null }
type HubData = Awaited<ReturnType<typeof getProjectHub>>

export default function FakturaPage() {
  const params = useParams()
  const projectId = params.id as string

  const [hub, setHub] = useState<HubData>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [assigneeId, setAssigneeId] = useState<string | null>(null)
  const [taskDone, setTaskDone] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [marking, setMarking] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!projectId) return
    Promise.all([
      getProjectHub(projectId),
      getPreprodDetail(projectId),
    ]).then(([hubData, preprodData]) => {
      setHub(hubData)
      setAssigneeId((hubData?.project as { invoice_assignee_id?: string | null })?.invoice_assignee_id ?? null)
      setProfiles(preprodData?.profiles ?? [])
      // Sjekk om "Send faktura"-tasken er done
      const task = hubData?.tasks?.find(t => t.title === 'Send faktura')
      setTaskDone(task?.status === 'done')
      setLoading(false)
    })
  }, [projectId])

  const assignee = profiles.find(p => p.id === assigneeId) ?? null

  async function handleAssign(profileId: string | null) {
    setSaving(true)
    setPickerOpen(false)
    setAssigneeId(profileId)
    await setInvoiceAssignee(projectId, profileId)
    setSaving(false)
  }

  async function handleMarkDone() {
    if (marking || taskDone) return
    setMarking(true)
    setTaskDone(true)
    // Finn og oppdater "Send faktura"-tasken
    const task = hub?.tasks?.find(t => t.title === 'Send faktura')
    if (task) {
      const { updatePreprodTaskStatus } = await import('@/lib/actions/preprod')
      await updatePreprodTaskStatus(task.id, 'done')
    }
    // Auto-advance til videresalg
    await updatePipelineStage(projectId, 'videresalg')
    setMarking(false)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: C.text3, fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem' }}>Laster…</span>
      </div>
    )
  }

  const project = hub?.project
  const customerName = (project?.customer as { name?: string | null } | null)?.name ?? null

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '32px 24px', fontFamily: 'var(--font-dm-sans)' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 28 }}>
          <Link href="/admin/pipeline" style={{ color: C.text3, fontSize: '0.78rem', textDecoration: 'none' }}>Pipeline</Link>
          <span style={{ color: C.text3, fontSize: '0.78rem' }}>›</span>
          <span style={{ color: C.text2, fontSize: '0.78rem' }}>{project?.title ?? '—'}</span>
          <span style={{ color: C.text3, fontSize: '0.78rem' }}>›</span>
          <span style={{ color: C.text, fontSize: '0.78rem', fontWeight: 600 }}>Faktura</span>
        </div>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: C.text, lineHeight: 1.2 }}>
            {project?.title ?? '—'}
          </h1>
          {customerName && (
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: C.text3 }}>{customerName}</p>
          )}
        </div>

        {/* Faktura-kort */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>

          {/* Task-rad */}
          <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: `1px solid ${C.border}` }}>
            {/* Checkbox */}
            <button
              onClick={handleMarkDone}
              disabled={marking}
              style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0, cursor: taskDone ? 'default' : 'pointer',
                background: taskDone ? C.success : 'transparent',
                border: `2px solid ${taskDone ? C.success : C.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}
            >
              {taskDone && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>

            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: taskDone ? C.text3 : C.text, textDecoration: taskDone ? 'line-through' : 'none' }}>
                Send faktura
              </p>
              <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: C.text3 }}>
                Faktureringen skjer i Fiken — merk som ferdig når den er sendt
              </p>
            </div>

            {taskDone && (
              <span style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.success, background: `${C.success}18`, borderRadius: 6, padding: '3px 8px' }}>
                Sendt
              </span>
            )}
          </div>

          {/* Ansvarlig-rad */}
          <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.text3, marginBottom: 6 }}>
                Ansvarlig
              </p>
              {assignee ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar id={assignee.id} name={assignee.name} color={assignee.color} size={24} />
                  <span style={{ fontSize: '0.85rem', color: C.text }}>{assignee.name}</span>
                </div>
              ) : (
                <span style={{ fontSize: '0.82rem', color: C.text3, fontStyle: 'italic' }}>Ikke tildelt</span>
              )}
            </div>

            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setPickerOpen(o => !o)}
                disabled={saving}
                style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600,
                  color: C.accent, background: `${C.accent}14`, border: `1px solid ${C.accent}30`,
                  borderRadius: 7, padding: '6px 12px', cursor: 'pointer',
                }}
              >
                {assignee ? 'Bytt' : 'Tildel'}
              </button>

              {pickerOpen && (
                <div style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 50,
                  background: C.surface2, border: `1px solid ${C.border}`,
                  borderRadius: 10, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  overflow: 'hidden',
                }}>
                  {assigneeId && (
                    <button
                      onClick={() => handleAssign(null)}
                      style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', color: C.danger, fontFamily: 'var(--font-dm-sans)' }}
                    >
                      Fjern tildeling
                    </button>
                  )}
                  {profiles.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleAssign(p.id)}
                      style={{
                        width: '100%', textAlign: 'left', padding: '10px 14px',
                        background: p.id === assigneeId ? `${C.accent}14` : 'none',
                        border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-dm-sans)',
                      }}
                    >
                      <Avatar id={p.id} name={p.name} color={p.color} size={22} />
                      <div>
                        <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: p.id === assigneeId ? 600 : 400, color: C.text }}>{p.name}</p>
                        <p style={{ margin: 0, fontSize: '0.7rem', color: C.text3 }}>{p.email}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Info-boks */}
        <div style={{ marginTop: 16, padding: '12px 16px', background: `${C.accent}08`, border: `1px solid ${C.accent}20`, borderRadius: 8 }}>
          <p style={{ margin: 0, fontSize: '0.78rem', color: C.text3, lineHeight: 1.5 }}>
            Faktureringen håndteres i <strong style={{ color: C.text2 }}>Fiken</strong>. Marker som ferdig her når fakturaen er sendt — prosjektet flyttes automatisk til Videresalg.
          </p>
        </div>

        {/* Tilbake */}
        <div style={{ marginTop: 24 }}>
          <Link href="/admin/pipeline" style={{ fontSize: '0.8rem', color: C.text3, textDecoration: 'none' }}>
            ← Tilbake til pipeline
          </Link>
        </div>

      </div>

      {/* Lukk picker ved klikk utenfor */}
      {pickerOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 40 }}
          onClick={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
