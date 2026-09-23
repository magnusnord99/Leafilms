'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getProjectHub } from '@/lib/actions/pipeline'
import { getLeadByProjectId, updateLeadStatus, updateLeadNotes, updateLead, LeadRecord, LeadStatus, LeadTemperature } from '@/lib/actions/leads'
import LeadTaskPanel from '@/components/admin/LeadTaskPanel'
import RichNotesEditor from '@/components/admin/RichNotesEditor'
import { ColdEmailCard } from '@/components/admin/ColdEmailCard'
import { TemperatureSlider } from '@/components/admin/TemperatureSlider'
import { LEAD_TEMPERATURE_CONFIG } from '@/lib/lead-temperature'
import { ProjectMessage } from '@/lib/types'
import { getStageAccess } from '@/lib/pipeline-stage-lock'
import { STAGE_LABEL } from '@/lib/pipeline-ui'
import { PastStageBanner } from '@/components/admin/PastStageBanner'
import { PipelineProgress } from '@/components/admin/PipelineProgress'
import type { PipelineStage } from '@/lib/types'
import { C } from '@/lib/admin-theme'

// Eldre notater lagret som ren tekst (før rik tekst-editoren) — bevar linjeskift
// som avsnitt/<br> når de lastes inn i TipTap-editoren første gang.
function notesToHtml(raw: string): string {
  if (!raw) return ''
  if (/<[a-z][\s\S]*>/i.test(raw)) return raw
  return raw.split(/\n{2,}/).map(block => `<p>${block.replace(/\n/g, '<br>')}</p>`).join('')
}

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string }> = {
  new:            { label: 'Ny',          color: C.text2   },
  contacted:      { label: 'Kontaktet',   color: C.accent  },
  meeting_booked: { label: 'Møte booket', color: C.warning },
  converted:      { label: 'Konvertert',  color: C.success },
  lost:           { label: 'Tapt',        color: C.danger  },
}

const SOURCE_LABELS: Record<string, string> = {
  market_analysis: 'Markedsanalyse',
  instagram:       'Instagram',
  linkedin:        'LinkedIn',
  nettside:        'Nettside',
  referanse:       'Referanse',
  telefon:         'Telefon',
}

const SOURCE_SUGGESTIONS = ['Markedsanalyse', 'Instagram', 'LinkedIn', 'Nettside', 'Referanse', 'Telefon']

const editInputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem',
  color: C.text, background: C.surface2,
  border: `1px solid ${C.border}`, borderRadius: 7,
  padding: '9px 12px', outline: 'none',
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.text3, marginBottom: 5 }}>
      {children}
    </label>
  )
}

type LeadEditForm = {
  name: string
  company: string
  email: string
  phone: string
  website: string
  source: string
  reason: string
  salesPoints: string[]
  temperature: '' | LeadTemperature
  contactDeadline: string
}

export default function ProjectContactPage() {
  const params = useParams()
  const projectId = params.id as string

  const [projectTitle, setProjectTitle] = useState<string | null>(null)
  const [projectStage, setProjectStage] = useState<PipelineStage | null>(null)
  const [unlocked, setUnlocked] = useState(false)
  const [customer, setCustomer] = useState<{ name: string; company: string | null; email?: string | null; phone?: string | null } | null>(null)
  const [lead, setLead] = useState<LeadRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<LeadEditForm>({
    name: '', company: '', email: '', phone: '', website: '', source: '', reason: '', salesPoints: [''],
    temperature: '', contactDeadline: '',
  })
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [messages, setMessages] = useState<ProjectMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function fetchMessages() {
    try {
      const res = await fetch(`/api/projects/${projectId}/messages`)
      if (res.ok) {
        const { messages: data } = await res.json()
        setMessages(data ?? [])
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    Promise.all([
      getProjectHub(projectId),
      getLeadByProjectId(projectId),
    ]).then(([hub, leadData]) => {
      setProjectTitle(hub?.project.title ?? null)
      setProjectStage(hub?.project.pipeline_stage ?? null)
      setCustomer(hub?.project.customer ?? null)
      setLead(leadData)
      setNotes(notesToHtml(leadData?.notes ?? ''))
      setLoading(false)
    })
    fetchMessages()
  }, [projectId])

  async function handleSendMessage() {
    if (!newMessage.trim() || sendingMsg) return
    setSendingMsg(true)
    const content = newMessage.trim()
    setNewMessage('')
    try {
      const res = await fetch(`/api/projects/${projectId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (res.ok) {
        const { message } = await res.json()
        setMessages(prev => [...prev, message])
      }
    } catch { /* ignore */ }
    setSendingMsg(false)
  }

  async function handleStatusChange(status: LeadStatus) {
    if (!lead) return
    setLead(prev => prev ? { ...prev, status } : prev)
    await updateLeadStatus(lead.id, status)
  }

  function startEdit() {
    if (!lead) return
    setEditForm({
      name: lead.name,
      company: lead.company ?? '',
      email: lead.email ?? '',
      phone: lead.phone ?? '',
      website: lead.website ?? '',
      source: lead.source ?? '',
      reason: lead.reason ?? '',
      salesPoints: (lead.sales_points ?? []).length > 0 ? lead.sales_points : [''],
      temperature: lead.temperature ?? '',
      contactDeadline: lead.contact_deadline ?? '',
    })
    setEditError(null)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setEditError(null)
  }

  function updateEditSalesPoint(i: number, val: string) {
    setEditForm(prev => ({ ...prev, salesPoints: prev.salesPoints.map((p, idx) => idx === i ? val : p) }))
  }

  function addEditSalesPoint() {
    setEditForm(prev => ({ ...prev, salesPoints: [...prev.salesPoints, ''] }))
  }

  function removeEditSalesPoint(i: number) {
    setEditForm(prev => ({ ...prev, salesPoints: prev.salesPoints.filter((_, idx) => idx !== i) }))
  }

  async function handleSaveEdit() {
    if (!lead) return
    if (!editForm.name.trim() && !editForm.company.trim()) {
      setEditError('Fyll inn navn eller bedrift')
      return
    }
    setSavingEdit(true)
    setEditError(null)
    const finalName = editForm.name.trim() || editForm.company.trim()
    const ok = await updateLead(lead.id, {
      name: finalName,
      company: editForm.company,
      email: editForm.email,
      phone: editForm.phone,
      website: editForm.website,
      source: editForm.source,
      reason: editForm.reason,
      sales_points: editForm.salesPoints,
      temperature: editForm.temperature || undefined,
      contact_deadline: editForm.contactDeadline || undefined,
    })
    if (ok) {
      setLead(prev => prev ? {
        ...prev,
        name: finalName,
        company: editForm.company.trim() || null,
        email: editForm.email.trim() || null,
        phone: editForm.phone.trim() || null,
        website: editForm.website.trim() || null,
        source: editForm.source || null,
        reason: editForm.reason.trim() || null,
        sales_points: editForm.salesPoints.filter(s => s.trim()),
        temperature: editForm.temperature || null,
        contact_deadline: editForm.contactDeadline || null,
      } : prev)
      setEditing(false)
    } else {
      setEditError('Noe gikk galt. Prøv igjen.')
    }
    setSavingEdit(false)
  }

  function handleNotesChange(value: string) {
    setNotes(value)
    setNotesSaving(true)
    setNotesSaved(false)
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(async () => {
      if (!lead) return
      await updateLeadNotes(lead.id, value)
      setNotesSaving(false)
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 2000)
    }, 800)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>Laster...</p>
      </div>
    )
  }

  const access = projectStage ? getStageAccess('lead', projectStage) : 'current'

  if (access === 'not_yet_reached') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 16 }}>
            Prosjektet har ikke nådd dette steget ennå
          </p>
          <Link href="/admin/pipeline" style={{ textDecoration: 'none' }}>
            <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', background: C.surface2, color: C.text2, border: `1px solid ${C.border}` }}>
              ← Tilbake
            </button>
          </Link>
        </div>
      </div>
    )
  }

  const readOnly = access === 'past' && !unlocked

  // Use lead info if available, fall back to customer info
  const name = lead?.name ?? customer?.name ?? projectTitle ?? 'Ukjent'
  const company = lead?.company ?? customer?.company ?? null
  const email = lead?.email ?? customer?.email ?? null
  const phone = lead?.phone ?? (customer as { phone?: string | null } | null)?.phone ?? null
  const website = lead?.website ?? null
  const status = lead ? STATUS_CONFIG[lead.status] : null

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '32px 32px 64px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>

        {/* Stegmeny — samme som prosjektoversikten, for å bla mellom stegene uten å måtte om via den */}
        {projectStage && (
          <div style={{ marginBottom: 16 }}>
            <PipelineProgress currentStage={projectStage} projectId={projectId} />
          </div>
        )}

        {access === 'past' && (
          <PastStageBanner
            currentStageLabel={projectStage ? STAGE_LABEL[projectStage] : ''}
            unlocked={unlocked}
            onUnlock={() => setUnlocked(true)}
          />
        )}

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24 }}>
          <Link href="/admin/pipeline" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, textDecoration: 'none' }}>Pipeline</Link>
          <span style={{ color: C.text3, fontSize: '0.72rem' }}>›</span>
          {projectTitle && (
            <>
              <Link href={`/admin/projects/${projectId}`} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, textDecoration: 'none' }}>{projectTitle}</Link>
              <span style={{ color: C.text3, fontSize: '0.72rem' }}>›</span>
            </>
          )}
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2 }}>Ta kontakt</span>
        </div>

        {/* Header */}
        <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            {editing ? (
              <div style={{ flex: 1, maxWidth: 480 }}>
                <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 12, marginBottom: 12 }}>
                  <div>
                    <FieldLabel>Navn</FieldLabel>
                    <input
                      value={editForm.name}
                      onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                      style={editInputStyle}
                    />
                  </div>
                  <div>
                    <FieldLabel>Bedrift</FieldLabel>
                    <input
                      value={editForm.company}
                      onChange={e => setEditForm(prev => ({ ...prev, company: e.target.value }))}
                      style={editInputStyle}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 12, maxWidth: 480 }}>
                  <div>
                    <FieldLabel>Kilde</FieldLabel>
                    <input
                      list="source-suggestions"
                      value={editForm.source}
                      onChange={e => setEditForm(prev => ({ ...prev, source: e.target.value }))}
                      placeholder="Hvor kom leaden fra?"
                      style={editInputStyle}
                    />
                    <datalist id="source-suggestions">
                      {SOURCE_SUGGESTIONS.map(s => <option key={s} value={s} />)}
                    </datalist>
                  </div>
                  <div>
                    <FieldLabel>Temperatur</FieldLabel>
                    <TemperatureSlider
                      value={editForm.temperature}
                      onChange={t => setEditForm(prev => ({ ...prev, temperature: t }))}
                      onClear={() => setEditForm(prev => ({ ...prev, temperature: '' }))}
                    />
                  </div>
                  <div>
                    <FieldLabel>Kontakt innen</FieldLabel>
                    <input
                      type="date"
                      value={editForm.contactDeadline}
                      onChange={e => setEditForm(prev => ({ ...prev, contactDeadline: e.target.value }))}
                      style={{ ...editInputStyle, cursor: 'pointer' }}
                    />
                  </div>
                </div>
                {editError && (
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.danger, marginTop: 10 }}>{editError}</p>
                )}
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                  <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.6rem', fontWeight: 700, color: C.text, lineHeight: 1.2 }}>
                    {name}
                  </h1>
                  {status && (
                    <span style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600,
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                      color: status.color, background: `${status.color}18`,
                      border: `1px solid ${status.color}30`,
                      padding: '3px 9px', borderRadius: 5,
                    }}>
                      {status.label}
                    </span>
                  )}
                  {lead?.temperature && (
                    <span style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600,
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                      color: LEAD_TEMPERATURE_CONFIG[lead.temperature].color,
                      background: `${LEAD_TEMPERATURE_CONFIG[lead.temperature].color}18`,
                      border: `1px solid ${LEAD_TEMPERATURE_CONFIG[lead.temperature].color}30`,
                      padding: '3px 9px', borderRadius: 5,
                    }}>
                      {LEAD_TEMPERATURE_CONFIG[lead.temperature].label}
                    </span>
                  )}
                </div>
                {company && (
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.9rem', color: C.text2, marginBottom: 2 }}>{company}</p>
                )}
                {lead?.source && (
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
                    Kilde: {SOURCE_LABELS[lead.source] ?? lead.source}
                  </p>
                )}
                {lead?.contact_deadline && (() => {
                  const overdue = new Date(lead.contact_deadline) < new Date(new Date().toDateString())
                  return (
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: overdue ? C.danger : C.text3, marginTop: 2, fontWeight: overdue ? 600 : 400 }}>
                      {overdue ? '⚠ Skulle vært kontaktet innen ' : 'Kontakt innen '}
                      {new Date(lead.contact_deadline).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}
                    </p>
                  )
                })()}
              </div>
            )}

            {/* Status-oppdatering + rediger */}
            {lead && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {(Object.entries(STATUS_CONFIG) as [LeadStatus, typeof STATUS_CONFIG[LeadStatus]][]).map(([val, conf]) => (
                    <button
                      key={val}
                      onClick={() => handleStatusChange(val)}
                      disabled={readOnly}
                      style={{
                        fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 500,
                        padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
                        background: lead.status === val ? `${conf.color}18` : 'transparent',
                        color: lead.status === val ? conf.color : C.text3,
                        border: `1px solid ${lead.status === val ? `${conf.color}40` : C.border}`,
                        transition: 'all 0.12s',
                      }}
                    >
                      {conf.label}
                    </button>
                  ))}
                </div>
                {!readOnly && (
                  editing ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={cancelEdit}
                        disabled={savingEdit}
                        style={{
                          fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 500,
                          padding: '5px 11px', borderRadius: 5, cursor: 'pointer',
                          background: 'transparent', color: C.text3, border: `1px solid ${C.border}`,
                        }}
                      >
                        Avbryt
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        disabled={savingEdit}
                        style={{
                          fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600,
                          padding: '5px 12px', borderRadius: 5, cursor: savingEdit ? 'default' : 'pointer',
                          background: C.accent, color: '#fff', border: 'none',
                          opacity: savingEdit ? 0.6 : 1,
                        }}
                      >
                        {savingEdit ? 'Lagrer...' : 'Lagre'}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={startEdit}
                      style={{
                        fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 500,
                        padding: '5px 11px', borderRadius: 5, cursor: 'pointer',
                        background: 'transparent', color: C.text2, border: `1px solid ${C.border}`,
                      }}
                    >
                      Rediger
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 20 }}>

          {/* Venstre kolonne */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Kontakt-knapper */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '18px 20px' }}>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 14 }}>
                Kontakt
              </p>

              {editing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <FieldLabel>Telefon</FieldLabel>
                    <input
                      value={editForm.phone}
                      onChange={e => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                      style={editInputStyle}
                    />
                  </div>
                  <div>
                    <FieldLabel>E-post</FieldLabel>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={e => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                      style={editInputStyle}
                    />
                  </div>
                  <div>
                    <FieldLabel>Nettside</FieldLabel>
                    <input
                      value={editForm.website}
                      onChange={e => setEditForm(prev => ({ ...prev, website: e.target.value }))}
                      style={editInputStyle}
                    />
                  </div>
                </div>
              ) : (
                <>
                  {phone && (
                    <a href={`tel:${phone}`} style={{ textDecoration: 'none', display: 'block', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', transition: 'border-color 0.12s' }}
                        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.success}
                        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.border}
                      >
                        <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(76,175,125,0.12)', border: '1px solid rgba(76,175,125,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.success} strokeWidth="2" strokeLinecap="round">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 9.69 19.79 19.79 0 0 1 1.61 1.1 2 2 0 0 1 3.61 0h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 7.91a16 16 0 0 0 6.18 6.18l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                          </svg>
                        </div>
                        <div>
                          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.success }}>{phone}</p>
                          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>Trykk for å ringe</p>
                        </div>
                      </div>
                    </a>
                  )}

                  {email && (
                    <a href={`mailto:${email}`} style={{ textDecoration: 'none', display: 'block', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', transition: 'border-color 0.12s' }}
                        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.accent}
                        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.border}
                      >
                        <div style={{ width: 34, height: 34, borderRadius: 8, background: C.accentBg, border: '1px solid rgba(124,92,252,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                            <polyline points="22,6 12,13 2,6" />
                          </svg>
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</p>
                          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>Åpne e-postklient</p>
                        </div>
                      </div>
                    </a>
                  )}

                  {website && (
                    <a href={`https://${website.replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', transition: 'border-color 0.12s' }}
                        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.text2}
                        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.border}
                      >
                        <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--admin-overlay-04)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.text2} strokeWidth="2" strokeLinecap="round">
                            <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                          </svg>
                        </div>
                        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text2 }}>
                          {website.replace(/^https?:\/\//, '')} ↗
                        </p>
                      </div>
                    </a>
                  )}

                  {!phone && !email && !website && (
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, fontStyle: 'italic' }}>
                      Ingen kontaktinfo registrert
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Hvorfor passer dette */}
            {(editing || lead?.reason) && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '18px 20px' }}>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 12 }}>
                  Hvorfor passer dette for oss
                </p>
                {editing ? (
                  <textarea
                    value={editForm.reason}
                    onChange={e => setEditForm(prev => ({ ...prev, reason: e.target.value }))}
                    placeholder="Beskriv kort hvorfor denne leaden er interessant for Leafilms..."
                    rows={3}
                    style={{ ...editInputStyle, resize: 'vertical', lineHeight: 1.6 }}
                  />
                ) : (
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text2, lineHeight: 1.65 }}>
                    {lead?.reason}
                  </p>
                )}
              </div>
            )}

            {/* Notater — kun om lead finnes */}
            {lead && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3 }}>
                    Notater
                  </p>
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: notesSaved ? C.success : C.text3, transition: 'color 0.2s' }}>
                    {notesSaving ? 'Lagrer...' : notesSaved ? 'Lagret ✓' : ''}
                  </span>
                </div>
                <RichNotesEditor
                  value={notes}
                  onChange={handleNotesChange}
                  placeholder="Legg til notater..."
                  readOnly={readOnly}
                />
              </div>
            )}
          </div>

          {/* Høyre kolonne */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Salgspunkter */}
            {lead && (editing || (lead.sales_points ?? []).length > 0) && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '18px 20px' }}>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 14 }}>
                  Salgspunkter
                </p>
                {editing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {editForm.salesPoints.map((point, i) => (
                      <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                          background: C.accentBg, border: '1px solid rgba(124,92,252,0.2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                            <path d="M1 4L3 6.5L7 1.5" stroke={C.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                        <input
                          value={point}
                          onChange={e => updateEditSalesPoint(i, e.target.value)}
                          placeholder={`Salgspunkt ${i + 1}`}
                          style={{ ...editInputStyle, flex: 1 }}
                        />
                        {editForm.salesPoints.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeEditSalesPoint(i)}
                            style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', padding: '0 4px', fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addEditSalesPoint}
                      style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.accent, background: C.accentBg, border: '1px dashed rgba(124,92,252,0.3)', borderRadius: 7, padding: '7px 14px', cursor: 'pointer', alignSelf: 'flex-start', marginTop: 3 }}
                    >
                      + Legg til salgspunkt
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(lead.sales_points ?? []).map((point, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ width: 20, height: 20, borderRadius: 5, background: C.accentBg, border: '1px solid rgba(124,92,252,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                            <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke={C.accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text, lineHeight: 1.5 }}>{point}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Kald e-post */}
            {lead?.cold_email && (
              <ColdEmailCard leadId={lead.id} coldEmail={lead.cold_email} initialTo={email} />
            )}

            {/* Fallback: ingen lead-data */}
            {!lead && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '24px 20px', textAlign: 'center' }}>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 4 }}>
                  Ingen lead-profil koblet til dette prosjektet
                </p>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
                  Salgspunkter og kald e-post vises når et lead er tilknyttet
                </p>
              </div>
            )}

            {/* Oppgaver + ansvarlig */}
            {lead && (
              <LeadTaskPanel
                projectId={projectId}
                leadId={lead.id}
                assignedTo={lead.assigned_to}
                canCreate={lead.status !== 'converted' && lead.status !== 'lost'}
                readOnly={readOnly}
              />
            )}

            {/* Snarvei til prosjektsiden */}
            <Link href={`/admin/projects/${projectId}`} style={{ textDecoration: 'none' }}>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', transition: 'border-color 0.12s' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.hoverBorder}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.border}
              >
                <div>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 500, color: C.text, marginBottom: 2 }}>Gå til prosjektoversikt</p>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>Oppgaver, pitch og tilbud</p>
                </div>
                <span style={{ color: C.text3, fontSize: '0.8rem' }}>→</span>
              </div>
            </Link>
          </div>
        </div>

        {/* Chat */}
        <div style={{ marginTop: 28 }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 14 }}>
            Intern chat
          </p>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            {/* Meldinger */}
            <div style={{ minHeight: 120, maxHeight: 340, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {messages.length === 0 ? (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, textAlign: 'center', marginTop: 16 }}>
                  Ingen meldinger ennå. Skriv en logg eller notat om kontakten.
                </p>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} style={{ display: 'flex', gap: 10 }}>
                    <span style={{
                      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                      background: C.surface2, border: `1px solid ${C.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', fontWeight: 700, color: C.text2,
                      marginTop: 1,
                    }}>
                      {(msg.user_name ?? '?')[0].toUpperCase()}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, color: C.text2 }}>
                          {msg.user_name ?? 'Ukjent'}
                        </span>
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>
                          {new Date(msg.created_at).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {msg.content}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div style={{ borderTop: `1px solid ${C.border}`, padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage() } }}
                placeholder="Logg en samtale, send en oppdatering... (Enter for å sende)"
                rows={2}
                style={{
                  flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem',
                  color: C.text, background: C.surface2,
                  border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: '8px 12px', resize: 'none', outline: 'none', lineHeight: 1.5,
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                onBlur={e => { e.currentTarget.style.borderColor = C.border }}
              />
              <button
                onClick={handleSendMessage}
                disabled={!newMessage.trim() || sendingMsg}
                style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  background: newMessage.trim() && !sendingMsg ? C.accent : C.surface2,
                  border: 'none', cursor: newMessage.trim() && !sendingMsg ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: !newMessage.trim() || sendingMsg ? 0.45 : 1,
                  transition: 'background 0.15s, opacity 0.15s',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M12.5 7L1.5 2.5L4.5 7L1.5 11.5L12.5 7Z" fill="white" />
                </svg>
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
