'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getLeadById, updateLeadStatus, updateLeadNotes, deleteLead, LeadRecord, LeadStatus } from '@/lib/actions/leads'
import LeadTaskPanel from '@/components/admin/LeadTaskPanel'

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

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string }> = {
  new:            { label: 'Ny',              color: C.text2    },
  contacted:      { label: 'Kontaktet',       color: C.accent   },
  meeting_booked: { label: 'Møte booket',     color: C.warning  },
  converted:      { label: 'Konvertert',      color: C.success  },
  lost:           { label: 'Tapt',            color: C.danger   },
}

const SOURCE_LABELS: Record<string, string> = {
  market_analysis: 'Markedsanalyse',
  instagram:       'Instagram',
  linkedin:        'LinkedIn',
  nettside:        'Nettside',
  referanse:       'Referanse',
  telefon:         'Telefon',
}

export default function LeadDetailPage() {
  const params = useParams()
  const router = useRouter()
  const leadId = params.id as string

  const [lead, setLead] = useState<LeadRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getLeadById(leadId).then(data => {
      setLead(data)
      setNotes(data?.notes ?? '')
      setLoading(false)
    })
  }, [leadId])

  async function handleStatusChange(status: LeadStatus) {
    if (!lead) return
    setLead(prev => prev ? { ...prev, status } : prev)
    await updateLeadStatus(leadId, status)
  }

  function handleNotesChange(value: string) {
    setNotes(value)
    setNotesSaving(true)
    setNotesSaved(false)
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(async () => {
      await updateLeadNotes(leadId, value)
      setNotesSaving(false)
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 2000)
    }, 800)
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    const ok = await deleteLead(leadId)
    if (ok) {
      router.push('/admin/leads')
    } else {
      setDeleting(false)
      setConfirmDelete(false)
      alert('Kunne ikke slette lead. Prøv igjen.')
    }
  }

  async function handleCopyEmail() {
    if (!lead?.cold_email) return
    await navigator.clipboard.writeText(lead.cold_email)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>Laster...</p>
      </div>
    )
  }

  if (!lead) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 16 }}>Fant ikke leaden.</p>
          <Link href="/admin/pipeline">
            <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', background: C.surface2, color: C.text2, border: `1px solid ${C.border}` }}>
              ← Pipeline
            </button>
          </Link>
        </div>
      </div>
    )
  }

  const status = STATUS_CONFIG[lead.status]

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '32px 32px 64px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24 }}>
          <Link href="/admin/pipeline" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, textDecoration: 'none' }}>Pipeline</Link>
          <span style={{ color: C.text3, fontSize: '0.72rem' }}>›</span>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2 }}>Lead</span>
        </div>

        {/* Header */}
        <div style={{ marginBottom: 32, paddingBottom: 28, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.6rem', fontWeight: 700, color: C.text, lineHeight: 1.2 }}>
                  {lead.name}
                </h1>
                <span style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: status.color, background: `${status.color}18`,
                  border: `1px solid ${status.color}30`,
                  padding: '3px 9px', borderRadius: 5,
                }}>
                  {status.label}
                </span>
              </div>
              {lead.company && (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.9rem', color: C.text2, marginBottom: 2 }}>
                  {lead.company}
                </p>
              )}
              {lead.source && (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
                  Kilde: {SOURCE_LABELS[lead.source] ?? lead.source}
                </p>
              )}
            </div>

            {/* Status buttons + delete */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {(Object.entries(STATUS_CONFIG) as [LeadStatus, typeof STATUS_CONFIG[LeadStatus]][]).map(([val, conf]) => (
                  <button
                    key={val}
                    onClick={() => handleStatusChange(val)}
                    style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 500,
                      padding: '5px 11px', borderRadius: 5, cursor: 'pointer',
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
              <button
                onClick={handleDelete}
                disabled={deleting}
                onBlur={() => setConfirmDelete(false)}
                style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 500,
                  padding: '5px 11px', borderRadius: 5, cursor: deleting ? 'not-allowed' : 'pointer',
                  background: confirmDelete ? `${C.danger}18` : 'transparent',
                  color: confirmDelete ? C.danger : C.text3,
                  border: `1px solid ${confirmDelete ? `${C.danger}40` : C.border}`,
                  transition: 'all 0.12s',
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting ? 'Sletter...' : confirmDelete ? 'Bekreft sletting' : 'Slett lead'}
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Kontakt */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '18px 20px' }}>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 14 }}>
                Kontakt
              </p>

              {lead.phone && (
                <a href={`tel:${lead.phone}`} style={{ textDecoration: 'none', display: 'block', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', transition: 'border-color 0.12s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.success}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.border}
                  >
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(76,175,125,0.12)', border: '1px solid rgba(76,175,125,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.success} strokeWidth="2" strokeLinecap="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 9.69 19.79 19.79 0 0 1 1.61 1.1 2 2 0 0 1 3.61 0h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 7.91a16 16 0 0 0 6.18 6.18l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                    </div>
                    <div>
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, color: C.success, lineHeight: 1 }}>{lead.phone}</p>
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, marginTop: 2 }}>Trykk for å ringe</p>
                    </div>
                  </div>
                </a>
              )}

              {lead.email && (
                <a href={`mailto:${lead.email}`} style={{ textDecoration: 'none', display: 'block', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', transition: 'border-color 0.12s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.accent}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.border}
                  >
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: C.accentBg, border: '1px solid rgba(124,92,252,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                        <polyline points="22,6 12,13 2,6" />
                      </svg>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, color: C.accent, lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.email}</p>
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, marginTop: 2 }}>Åpne e-postklient</p>
                    </div>
                  </div>
                </a>
              )}

              {lead.website && (
                <a href={`https://${lead.website.replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', transition: 'border-color 0.12s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.text2}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.border}
                  >
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.text2} strokeWidth="2" strokeLinecap="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                    </div>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lead.website.replace(/^https?:\/\//, '')} ↗
                    </p>
                  </div>
                </a>
              )}

              {!lead.phone && !lead.email && !lead.website && (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, fontStyle: 'italic' }}>Ingen kontaktinfo registrert</p>
              )}
            </div>

            {/* Hvorfor passer dette */}
            {lead.reason && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '18px 20px' }}>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 12 }}>
                  Hvorfor passer dette for oss
                </p>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text2, lineHeight: 1.65 }}>
                  {lead.reason}
                </p>
              </div>
            )}

            {/* Notater */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3 }}>
                  Interne notater
                </p>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: notesSaved ? C.success : C.text3, transition: 'color 0.2s' }}>
                  {notesSaving ? 'Lagrer...' : notesSaved ? 'Lagret ✓' : ''}
                </span>
              </div>
              <textarea
                value={notes}
                onChange={e => handleNotesChange(e.target.value)}
                placeholder="Legg til notater om denne leaden..."
                rows={5}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem',
                  color: C.text, background: C.surface2,
                  border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: '10px 12px', resize: 'vertical',
                  outline: 'none', lineHeight: 1.6,
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                onBlur={e => { e.currentTarget.style.borderColor = C.border }}
              />
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Oppgaver + ansvarlig */}
            {lead.converted_to_project_id && (
              <LeadTaskPanel
                projectId={lead.converted_to_project_id}
                leadId={lead.id}
                assignedTo={lead.assigned_to}
                canCreate={lead.status !== 'converted' && lead.status !== 'lost'}
              />
            )}

            {/* Salgspunkter */}
            {(lead.sales_points ?? []).length > 0 && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '18px 20px' }}>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 14 }}>
                  Salgspunkter
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(lead.sales_points ?? []).map((point, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 5, background: C.accentBg, border: '1px solid rgba(124,92,252,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                        <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                          <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke={C.accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text, lineHeight: 1.5 }}>
                        {point}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Kald e-post */}
            {lead.cold_email && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3 }}>
                    Kald e-post
                  </p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={handleCopyEmail}
                      style={{
                        fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 500,
                        padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
                        background: copied ? 'rgba(76,175,125,0.12)' : C.surface2,
                        color: copied ? C.success : C.text2,
                        border: `1px solid ${copied ? 'rgba(76,175,125,0.3)' : C.border}`,
                        transition: 'all 0.15s',
                      }}
                    >
                      {copied ? '✓ Kopiert' : 'Kopier'}
                    </button>
                    {lead.email && (
                      <a
                        href={`mailto:${lead.email}?body=${encodeURIComponent(lead.cold_email)}`}
                        style={{ textDecoration: 'none' }}
                      >
                        <button style={{
                          fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 500,
                          padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
                          background: C.accentBg, color: C.accent,
                          border: '1px solid rgba(124,92,252,0.25)',
                        }}>
                          Send →
                        </button>
                      </a>
                    )}
                  </div>
                </div>
                <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px' }}>
                  <p style={{
                    fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem',
                    color: C.text2, lineHeight: 1.7, whiteSpace: 'pre-wrap',
                  }}>
                    {lead.cold_email}
                  </p>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
