'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const fieldLabel = (text: string, required?: boolean) => (
  <label style={{
    display: 'block',
    fontFamily: 'var(--font-dm-sans)',
    fontSize: '0.6rem',
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    color: '#9E9287',
    fontWeight: 500,
    marginBottom: 6,
  }}>
    {text}{required && <span style={{ color: '#C49434', marginLeft: 4 }}>*</span>}
  </label>
)

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: '#161410',
  border: '1px solid #2A261F',
  borderRadius: 3,
  color: '#E8E1D5',
  fontFamily: 'var(--font-dm-sans)',
  fontSize: '0.75rem',
  letterSpacing: '0.03em',
  outline: 'none',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  appearance: 'none' as any,
}

export default function NewAIExample() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    section_type: '',
    project_type: '',
    example_text: '',
    quality_score: 5
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase
        .from('ai_examples')
        .insert({
          section_type: formData.section_type,
          project_type: formData.project_type,
          example_text: formData.example_text,
          quality_score: formData.quality_score
        })

      if (error) throw error

      router.push('/admin/ai-examples')
      router.refresh()
    } catch (err: any) {
      console.error('Error creating example:', err)
      setError('Kunne ikke opprette eksempel: ' + (err.message || 'Ukjent feil'))
    } finally {
      setLoading(false)
    }
  }

  const isValid = formData.section_type && formData.project_type && formData.example_text

  return (
    <div className="min-h-screen p-8 md:p-12" style={{ background: '#0C0B09', color: '#E8E1D5' }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <Link
            href="/admin/ai-examples"
            className="flex items-center gap-2 mb-8 transition-colors"
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.6rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#62594E',
              textDecoration: 'none',
            }}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
            Tilbake
          </Link>

          <div className="flex items-center gap-4 mb-4">
            <div style={{ width: 32, height: 1, background: '#C49434' }} />
            <span style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.6rem',
              letterSpacing: '0.16em',
              color: '#C49434',
              textTransform: 'uppercase',
              fontWeight: 500,
            }}>
              AI Eksempler
            </span>
          </div>
          <h1 style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: 'clamp(1.8rem, 3vw, 2.5rem)',
            fontWeight: 300,
            fontStyle: 'italic',
            color: '#E8E1D5',
            lineHeight: 1.1,
          }}>
            Nytt AI-eksempel
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: '#62594E', marginTop: 6, letterSpacing: '0.04em' }}>
            Legg til et teksteksempel som AI bruker som referanse
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div
            className="flex items-start justify-between gap-3 mb-6 px-4 py-3"
            style={{ background: 'rgba(184,64,64,0.1)', border: '1px solid rgba(184,64,64,0.3)', borderRadius: 3 }}
          >
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: '#E07070', lineHeight: 1.5 }}>{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              style={{ color: '#E07070', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}
            >
              ×
            </button>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            {fieldLabel('Seksjon', true)}
            <select
              required
              value={formData.section_type}
              onChange={(e) => setFormData({ ...formData, section_type: e.target.value })}
              style={selectStyle}
            >
              <option value="">Velg seksjon...</option>
              <option value="goal">Mål</option>
              <option value="concept">Konsept</option>
            </select>
          </div>

          <div>
            {fieldLabel('Prosjekttype', true)}
            <select
              required
              value={formData.project_type}
              onChange={(e) => setFormData({ ...formData, project_type: e.target.value })}
              style={selectStyle}
            >
              <option value="">Velg type...</option>
              <option value="event">Event</option>
              <option value="branding">Branding</option>
              <option value="documentary">Dokumentarisk</option>
            </select>
          </div>

          <div>
            {fieldLabel('Eksempeltekst', true)}
            <textarea
              required
              value={formData.example_text}
              onChange={(e) => setFormData({ ...formData, example_text: e.target.value })}
              placeholder="Skriv et godt eksempel på tekst for denne seksjonen..."
              rows={8}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <div>
            {fieldLabel('Kvalitet (1–10)')}
            <input
              type="number"
              min="1"
              max="10"
              value={formData.quality_score}
              onChange={(e) => setFormData({ ...formData, quality_score: parseInt(e.target.value) })}
              style={inputStyle}
            />
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: '#62594E', marginTop: 6 }}>
              Høyere poengsum = mer sannsynlig å bli valgt av AI
            </p>
          </div>

          {/* Info box */}
          <div
            style={{
              padding: '16px 20px',
              background: 'rgba(196,148,52,0.05)',
              border: '1px solid rgba(196,148,52,0.15)',
              borderRadius: 3,
            }}
          >
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: '#9E9287', lineHeight: 1.6 }}>
              Skriv eksempler som er representative for ønsket tone og stil. AI-en vil bruke disse som mal når den genererer ny tekst.
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading || !isValid}
              style={{
                flex: 1,
                padding: '10px 20px',
                background: (loading || !isValid) ? '#38332A' : '#C49434',
                color: (loading || !isValid) ? '#62594E' : '#0C0B09',
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.65rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                fontWeight: 600,
                border: 'none',
                borderRadius: 3,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {loading ? 'Oppretter...' : 'Opprett eksempel'}
            </button>
            <Link href="/admin/ai-examples">
              <button
                type="button"
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  color: '#62594E',
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.65rem',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  border: '1px solid #2A261F',
                  borderRadius: 3,
                  cursor: 'pointer',
                }}
              >
                Avbryt
              </button>
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
