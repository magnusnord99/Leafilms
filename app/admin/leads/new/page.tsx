'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createLead, analyzeLeadNotes } from '@/lib/actions/leads'
import { getAllProfiles } from '@/lib/actions/pipeline'
import RichNotesEditor from '@/components/admin/RichNotesEditor'

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

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
  danger:   '#E05555',
}

const SOURCE_OPTIONS = [
  { value: '',                label: 'Velg kilde...' },
  { value: 'market_analysis', label: 'Markedsanalyse' },
  { value: 'instagram',       label: 'Instagram' },
  { value: 'linkedin',        label: 'LinkedIn' },
  { value: 'nettside',        label: 'Nettside' },
  { value: 'referanse',       label: 'Referanse' },
  { value: 'telefon',         label: 'Telefon' },
  { value: 'annet',           label: 'Annet' },
]

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.text3, marginBottom: 6 }}>
      {children}{required && <span style={{ color: C.accent, marginLeft: 3 }}>*</span>}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem',
  color: C.text, background: C.surface2,
  border: `1px solid ${C.border}`, borderRadius: 8,
  padding: '9px 12px', outline: 'none',
  transition: 'border-color 0.15s',
}

export default function NewLeadPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [source, setSource] = useState('')
  const [reason, setReason] = useState('')
  const [salesPoints, setSalesPoints] = useState<string[]>(['', '', ''])
  const [coldEmail, setColdEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [notesSummary, setNotesSummary] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [quoteAssigneeId, setQuoteAssigneeId] = useState('')
  const [profiles, setProfiles] = useState<{ id: string; name: string | null; email: string }[]>([])

  useEffect(() => {
    getAllProfiles().then(setProfiles)
  }, [])

  function addSalesPoint() {
    setSalesPoints(prev => [...prev, ''])
  }

  function updateSalesPoint(i: number, val: string) {
    setSalesPoints(prev => prev.map((p, idx) => idx === i ? val : p))
  }

  function removeSalesPoint(i: number) {
    setSalesPoints(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleAnalyzeNotes() {
    if (!stripHtml(notes)) return
    setAnalyzing(true)
    setAnalyzeError(null)
    const result = await analyzeLeadNotes(notes, name.trim() || company.trim())
    if ('error' in result) {
      setAnalyzeError(result.error)
    } else {
      setNotesSummary(result.sammendrag)
    }
    setAnalyzing(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() && !company.trim()) {
      setError('Fyll inn navn eller bedrift')
      return
    }
    setSaving(true)
    setError(null)

    const result = await createLead({
      name: name.trim() || company.trim(),
      company,
      email,
      phone,
      website,
      source,
      reason,
      sales_points: salesPoints.filter(s => s.trim()),
      notes,
      quote_assignee_id: quoteAssigneeId || undefined,
    })

    if (!result) {
      setError('Noe gikk galt. Prøv igjen.')
      setSaving(false)
      return
    }

    router.push(`/admin/projects/${result.projectId}/contact`)
  }

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: '32px 32px 64px', color: C.text }}>
      <div style={{ maxWidth: 780, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 28 }}>
          <Link href="/admin/pipeline" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, textDecoration: 'none' }}>Pipeline</Link>
          <span style={{ color: C.text3 }}>›</span>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2 }}>Ny lead</span>
        </div>

        <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.6rem', fontWeight: 700, color: C.text, marginBottom: 6 }}>
          Legg til lead
        </h1>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text3, marginBottom: 36 }}>
          Leaden opprettes i pipeline og er klar for oppfølging med en gang.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Kontaktinfo */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '22px 24px' }}>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 18 }}>
                Kontaktinfo
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 14 }}>
                <div>
                  <Label required>Navn</Label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Kari Nilsen"
                    style={inputStyle}
                    onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                    onBlur={e => { e.currentTarget.style.borderColor = C.border }}
                  />
                </div>
                <div>
                  <Label>Bedrift</Label>
                  <input
                    value={company}
                    onChange={e => setCompany(e.target.value)}
                    placeholder="Norsk Matfestival AS"
                    style={inputStyle}
                    onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                    onBlur={e => { e.currentTarget.style.borderColor = C.border }}
                  />
                </div>
                <div>
                  <Label>E-post</Label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="kari@bedrift.no"
                    style={inputStyle}
                    onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                    onBlur={e => { e.currentTarget.style.borderColor = C.border }}
                  />
                </div>
                <div>
                  <Label>Telefon</Label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+47 900 00 000"
                    style={inputStyle}
                    onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                    onBlur={e => { e.currentTarget.style.borderColor = C.border }}
                  />
                </div>
                <div>
                  <Label>Nettside</Label>
                  <input
                    value={website}
                    onChange={e => setWebsite(e.target.value)}
                    placeholder="bedrift.no"
                    style={inputStyle}
                    onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                    onBlur={e => { e.currentTarget.style.borderColor = C.border }}
                  />
                </div>
                <div>
                  <Label>Kilde</Label>
                  <select
                    value={source}
                    onChange={e => setSource(e.target.value)}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                    onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                    onBlur={e => { e.currentTarget.style.borderColor = C.border }}
                  >
                    {SOURCE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Salgsinformasjon */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '22px 24px' }}>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 18 }}>
                Salgsinformasjon
              </p>

              <div style={{ marginBottom: 18 }}>
                <Label>Hvorfor passer dette for oss?</Label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Beskriv kort hvorfor denne leaden er interessant for Leafilms..."
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                  onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                  onBlur={e => { e.currentTarget.style.borderColor = C.border }}
                />
              </div>

              <div>
                <Label>Salgspunkter</Label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {salesPoints.map((point, i) => (
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
                        onChange={e => updateSalesPoint(i, e.target.value)}
                        placeholder={`Salgspunkt ${i + 1}`}
                        style={{ ...inputStyle, flex: 1 }}
                        onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                        onBlur={e => { e.currentTarget.style.borderColor = C.border }}
                      />
                      {salesPoints.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeSalesPoint(i)}
                          style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', padding: '0 4px', fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addSalesPoint}
                    style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.accent, background: C.accentBg, border: '1px dashed rgba(124,92,252,0.3)', borderRadius: 7, padding: '7px 14px', cursor: 'pointer', alignSelf: 'flex-start', marginTop: 3 }}
                  >
                    + Legg til salgspunkt
                  </button>
                </div>
              </div>

              {/* Tilbud-ansvarlig */}
              <div style={{ borderTop: `1px solid rgba(124,92,252,0.2)`, paddingTop: 14, marginTop: 6, display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.accent, whiteSpace: 'nowrap' }}>
                  👤 Tilbud-ansvarlig
                </label>
                <select
                  value={quoteAssigneeId}
                  onChange={e => setQuoteAssigneeId(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                  onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                  onBlur={e => { e.currentTarget.style.borderColor = C.border }}
                >
                  <option value=''>Velg hvem som sender tilbudet... (valgfritt)</option>
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.name ?? p.email}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Notater */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '22px 24px' }}>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 18 }}>
                Interne notater
              </p>
              <RichNotesEditor
                value={notes}
                onChange={setNotes}
                placeholder="Interne notater om leaden..."
              />
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  onClick={handleAnalyzeNotes}
                  disabled={analyzing || !stripHtml(notes)}
                  style={{
                    fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600,
                    padding: '6px 16px', borderRadius: 6, cursor: stripHtml(notes) ? 'pointer' : 'not-allowed',
                    background: stripHtml(notes) ? C.accent : C.surface2,
                    color: stripHtml(notes) ? '#fff' : C.text3, border: 'none',
                    opacity: analyzing ? 0.7 : 1, transition: 'background 0.15s',
                  }}
                >
                  {analyzing ? 'Analyserer...' : notesSummary ? 'Analyser på nytt' : 'Analyser med AI'}
                </button>
                {analyzing && (
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>Claude leser notater...</span>
                )}
                {!analyzing && analyzeError && (
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.danger }}>{analyzeError}</span>
                )}
              </div>
              {notesSummary && (
                <div style={{ marginTop: 14, padding: '12px 14px', background: C.surface2, borderRadius: 7, border: `1px solid ${C.border}` }}>
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.accent }}>
                    AI-oppsummering
                  </span>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text, marginTop: 8, lineHeight: 1.6 }}>
                    {notesSummary}
                  </p>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.danger, padding: '10px 14px', background: 'rgba(224,85,85,0.08)', border: '1px solid rgba(224,85,85,0.25)', borderRadius: 8 }}>
                {error}
              </p>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Link href="/admin/pipeline">
                <button type="button" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 500, padding: '10px 20px', borderRadius: 8, cursor: 'pointer', background: 'transparent', color: C.text3, border: `1px solid ${C.border}` }}>
                  Avbryt
                </button>
              </Link>
              <button
                type="submit"
                disabled={saving}
                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, padding: '10px 24px', borderRadius: 8, cursor: saving ? 'default' : 'pointer', background: C.accent, color: '#fff', border: 'none', opacity: saving ? 0.6 : 1, transition: 'opacity 0.15s' }}
              >
                {saving ? 'Oppretter...' : 'Legg til lead →'}
              </button>
            </div>

          </div>
        </form>
      </div>
    </div>
  )
}
