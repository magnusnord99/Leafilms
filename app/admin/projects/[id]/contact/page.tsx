'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getProjectHub, markProjectContacted } from '@/lib/actions/pipeline'
import { getLeadByProjectId, updateLeadStatus, updateLeadNotes, updateLead, LeadRecord, LeadStatus, LeadTemperature } from '@/lib/actions/leads'
import { ConvertLeadButton } from '@/components/admin/ConvertLeadButton'
import LeadTaskPanel from '@/components/admin/LeadTaskPanel'
import RichNotesEditor from '@/components/admin/RichNotesEditor'
import { ColdEmailCard } from '@/components/admin/ColdEmailCard'
import { TemperatureSlider } from '@/components/admin/TemperatureSlider'
import { LEAD_TEMPERATURE_CONFIG } from '@/lib/lead-temperature'
import { getStageAccess } from '@/lib/pipeline-stage-lock'
import { STAGE_LABEL } from '@/lib/pipeline-ui'
import { PastStageBanner } from '@/components/admin/PastStageBanner'
import { PipelineProgress } from '@/components/admin/PipelineProgress'
import { ProjectChat } from '@/components/project/ProjectChat'
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
  fontFamily: 'var(--font-dm-sans)', fontSize: '1rem',
  color: C.text, background: C.surface2,
  border: `1px solid ${C.border}`, borderRadius: 7,
  padding: '9px 12px', outline: 'none',
}

// Navn/bedrift i headeren skal se ut som overskrifter helt til man klikker i dem —
// transparent bakgrunn og kantlinje som kun vises på hover/fokus (feedback 622724f7).
const headerNameInputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-dm-sans)', fontSize: '1.6rem', fontWeight: 700,
  color: C.text, lineHeight: 1.2, background: 'transparent',
  border: '1px solid transparent', borderRadius: 6,
  padding: '2px 6px', margin: '-2px -6px', outline: 'none',
  minWidth: 120, maxWidth: '100%',
}

const headerCompanyInputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-dm-sans)', fontSize: '0.9rem',
  color: C.text2, lineHeight: 1.4, background: 'transparent',
  border: '1px solid transparent', borderRadius: 6,
  padding: '2px 6px', margin: '-2px -6px 0', outline: 'none',
  display: 'block', minWidth: 100, maxWidth: '100%',
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
  // company/email/phone er fjernet fra Customer — vi henter dem via lead eller customer_contacts
  const [customer, setCustomer] = useState<{ id?: string; name: string } | null>(null)
  const [lead, setLead] = useState<LeadRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [editForm, setEditForm] = useState<LeadEditForm>({
    name: '', company: '', email: '', phone: '', website: '', source: '', reason: '', salesPoints: [''],
    temperature: '', contactDeadline: '',
  })
  const [leadSaving, setLeadSaving] = useState(false)
  const [leadSaved, setLeadSaved] = useState(false)
  const leadSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    Promise.all([
      getProjectHub(projectId),
      getLeadByProjectId(projectId),
    ]).then(([hub, leadData]) => {
      setProjectTitle(hub?.project.title ?? null)
      setProjectStage(hub?.project.pipeline_stage ?? null)
      setCustomer(hub?.project.customer ?? null)
      setLead(leadData)
      if (leadData) {
        setEditForm({
          name: leadData.name,
          company: leadData.company ?? '',
          email: leadData.email ?? '',
          phone: leadData.phone ?? '',
          website: leadData.website ?? '',
          source: leadData.source ?? '',
          reason: leadData.reason ?? '',
          salesPoints: (leadData.sales_points ?? []).length > 0 ? leadData.sales_points : [''],
          temperature: leadData.temperature ?? '',
          contactDeadline: leadData.contact_deadline ?? '',
        })
      }
      setNotes(notesToHtml(leadData?.notes ?? ''))
      setLoading(false)
    })
  }, [projectId])

  async function handleStatusChange(status: LeadStatus) {
    if (!lead) return
    setLead(prev => prev ? { ...prev, status } : prev)
    await updateLeadStatus(lead.id, status)
  }

  // Inline autolagring: hvert felt skriver rett i editForm og fyrer av en
  // debounced lagring (samme mønster som notatene under), uten noen egen
  // rediger/lagre-knapp (feedback 622724f7).
  function scheduleSave(next: LeadEditForm) {
    if (!lead) return
    if (!next.name.trim() && !next.company.trim()) return // navn er NOT NULL i DB — ikke lagre et tomt felt
    setLeadSaving(true)
    setLeadSaved(false)
    if (leadSaveTimer.current) clearTimeout(leadSaveTimer.current)
    leadSaveTimer.current = setTimeout(async () => {
      const finalName = next.name.trim() || next.company.trim()
      const ok = await updateLead(lead.id, {
        name: finalName,
        company: next.company,
        email: next.email,
        phone: next.phone,
        website: next.website,
        source: next.source,
        reason: next.reason,
        sales_points: next.salesPoints,
        temperature: next.temperature || undefined,
        contact_deadline: next.contactDeadline || undefined,
      })
      if (ok) {
        setLead(prev => prev ? {
          ...prev,
          name: finalName,
          company: next.company.trim() || null,
          email: next.email.trim() || null,
          phone: next.phone.trim() || null,
          website: next.website.trim() || null,
          source: next.source || null,
          reason: next.reason.trim() || null,
          sales_points: next.salesPoints.filter(s => s.trim()),
          temperature: next.temperature || null,
          contact_deadline: next.contactDeadline || null,
        } : prev)
        setLeadSaved(true)
        setTimeout(() => setLeadSaved(false), 2000)
      }
      setLeadSaving(false)
    }, 800)
  }

  function updateField<K extends keyof LeadEditForm>(key: K, value: LeadEditForm[K]) {
    setEditForm(prev => {
      const next = { ...prev, [key]: value }
      scheduleSave(next)
      return next
    })
  }

  function updateEditSalesPoint(i: number, val: string) {
    updateField('salesPoints', editForm.salesPoints.map((p, idx) => idx === i ? val : p))
  }

  function addEditSalesPoint() {
    setEditForm(prev => ({ ...prev, salesPoints: [...prev.salesPoints, ''] }))
  }

  function removeEditSalesPoint(i: number) {
    updateField('salesPoints', editForm.salesPoints.filter((_, idx) => idx !== i))
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
  // Etter migrasjon 186 finnes ikke company/email/phone direkte på Customer — bruk lead-data
  const company = lead?.company ?? null
  const email = lead?.email ?? null
  const phone = lead?.phone ?? null
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
            <div style={{ flex: 1, maxWidth: 480 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                {lead && !readOnly ? (
                  <input
                    value={editForm.name}
                    onChange={e => updateField('name', e.target.value)}
                    placeholder="Navn"
                    style={headerNameInputStyle}
                    onFocus={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.background = C.surface2 }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}
                  />
                ) : (
                  <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.6rem', fontWeight: 700, color: C.text, lineHeight: 1.2 }}>
                    {name}
                  </h1>
                )}
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
              </div>
              {lead && !readOnly ? (
                <input
                  value={editForm.company}
                  onChange={e => updateField('company', e.target.value)}
                  placeholder="Bedrift (valgfritt)"
                  style={headerCompanyInputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.background = C.surface2 }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}
                />
              ) : company && (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.9rem', color: C.text2, marginBottom: 2 }}>{company}</p>
              )}
              {lead?.contact_deadline && lead.status === 'new' && (() => {
                // Fristen gjelder kun første kontakt — en gang leaden har status utover
                // "new" er den innen eller forbi definisjon, og skal ikke lenger vises.
                const overdue = new Date(lead.contact_deadline) < new Date(new Date().toDateString())
                return (
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: overdue ? C.danger : C.text3, marginTop: 4, fontWeight: overdue ? 600 : 400 }}>
                    {overdue ? '⚠ Skulle vært kontaktet innen ' : 'Kontakt innen '}
                    {new Date(lead.contact_deadline).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}
                  </p>
                )
              })()}
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: leadSaved ? C.success : C.text3, marginTop: 6, minHeight: '1em' }}>
                {leadSaving ? 'Lagrer...' : leadSaved ? 'Lagret ✓' : ''}
              </p>
            </div>

            {/* Status-oppdatering */}
            {lead && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 0 }}>
                <ConvertLeadButton lead={lead} customerId={customer?.id} disabled={leadSaving} />
                {(Object.entries(STATUS_CONFIG) as [LeadStatus, typeof STATUS_CONFIG[LeadStatus]][]).filter(([value]) => value !== 'converted').map(([val, conf]) => (
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
                <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 12 }}>
                  <div>
                    <FieldLabel>Kilde</FieldLabel>
                    <input
                      list="source-suggestions"
                      value={editForm.source}
                      onChange={e => updateField('source', e.target.value)}
                      placeholder="Hvor kom leaden fra?"
                      disabled={readOnly}
                      style={editInputStyle}
                    />
                    <datalist id="source-suggestions">
                      {SOURCE_SUGGESTIONS.map(s => <option key={s} value={s} />)}
                    </datalist>
                  </div>
                  <div>
                    <FieldLabel>Kontakt innen</FieldLabel>
                    <input
                      type="date"
                      value={editForm.contactDeadline}
                      onChange={e => updateField('contactDeadline', e.target.value)}
                      disabled={readOnly}
                      style={{ ...editInputStyle, cursor: 'pointer' }}
                    />
                  </div>
                </div>
                <div>
                  <FieldLabel>Temperatur</FieldLabel>
                  <TemperatureSlider
                    value={editForm.temperature}
                    onChange={t => updateField('temperature', t)}
                    onClear={() => updateField('temperature', '')}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <FieldLabel>Telefon</FieldLabel>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={editForm.phone}
                      onChange={e => updateField('phone', e.target.value)}
                      placeholder="Ikke registrert"
                      disabled={readOnly}
                      style={{ ...editInputStyle, flex: 1 }}
                    />
                    {phone && (
                      <a href={`tel:${phone}`} title="Ring" style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 7, textDecoration: 'none', background: 'rgba(76,175,125,0.12)', border: '1px solid rgba(76,175,125,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.success} strokeWidth="2" strokeLinecap="round">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 9.69 19.79 19.79 0 0 1 1.61 1.1 2 2 0 0 1 3.61 0h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 7.91a16 16 0 0 0 6.18 6.18l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                      </a>
                    )}
                  </div>
                </div>

                <div>
                  <FieldLabel>E-post</FieldLabel>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={e => updateField('email', e.target.value)}
                      placeholder="Ikke registrert"
                      disabled={readOnly}
                      style={{ ...editInputStyle, flex: 1 }}
                    />
                    {email && (
                      <a href={`mailto:${email}`} onClick={() => markProjectContacted(projectId)} title="Åpne e-postklient" style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 7, textDecoration: 'none', background: C.accentBg, border: '1px solid rgba(124,92,252,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                          <polyline points="22,6 12,13 2,6" />
                        </svg>
                      </a>
                    )}
                  </div>
                </div>

                <div>
                  <FieldLabel>Nettside</FieldLabel>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={editForm.website}
                      onChange={e => updateField('website', e.target.value)}
                      placeholder="Ikke registrert"
                      disabled={readOnly}
                      style={{ ...editInputStyle, flex: 1 }}
                    />
                    {website && (
                      <a href={`https://${website.replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer" title="Åpne nettside" style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 7, textDecoration: 'none', background: 'var(--admin-overlay-04)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.text2} strokeWidth="2" strokeLinecap="round">
                          <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
                          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                        </svg>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Hvorfor passer dette */}
            {lead && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '18px 20px' }}>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 12 }}>
                  Hvorfor passer dette for oss
                </p>
                <textarea
                  value={editForm.reason}
                  onChange={e => updateField('reason', e.target.value)}
                  placeholder="Beskriv kort hvorfor denne leaden er interessant for Leafilms..."
                  rows={3}
                  disabled={readOnly}
                  style={{ ...editInputStyle, resize: 'vertical', lineHeight: 1.6 }}
                />
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
            {lead && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '18px 20px' }}>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 14 }}>
                  Salgspunkter
                </p>
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
                        disabled={readOnly}
                        style={{ ...editInputStyle, flex: 1 }}
                      />
                      {!readOnly && editForm.salesPoints.length > 1 && (
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
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={addEditSalesPoint}
                      style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.accent, background: C.accentBg, border: '1px dashed rgba(124,92,252,0.3)', borderRadius: 7, padding: '7px 14px', cursor: 'pointer', alignSelf: 'flex-start', marginTop: 3 }}
                    >
                      + Legg til salgspunkt
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* E-post — vises uansett om AI har generert en kladd (cold_email) eller ikke,
                ellers er det ingen måte å sende e-post i det hele tatt for leads som ikke
                kommer fra markedsanalyse-agenten (f.eks. manuelt lagt inn, kilde "referanse"). */}
            {lead && (
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

        {/* Chat — samme flytende chat-komponent (ikon øverst til høyre) som resten av
            appen bruker, med @-tagging, i stedet for den tidligere alltid-synlige inline-
            chatten uten tagging (feedback 66f69c70). */}
        <ProjectChat projectId={projectId} />

      </div>
    </div>
  )
}
