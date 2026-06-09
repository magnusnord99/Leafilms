'use client'

import { use, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { AIExample } from '@/lib/types'
import { C } from '@/lib/admin-theme'

const fieldLabel = (text: string, required?: boolean) => (
  <label style={{
    display: 'block',
    fontFamily: 'var(--font-dm-sans)',
    fontSize: '0.6rem',
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    color: C.text2,
    fontWeight: 500,
    marginBottom: 6,
  }}>
    {text}{required && <span style={{ color: C.accent, marginLeft: 4 }}>*</span>}
  </label>
)

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 3,
  color: C.text,
  fontFamily: 'var(--font-dm-sans)',
  fontSize: '0.75rem',
  letterSpacing: '0.03em',
  outline: 'none',
}

type Props = {
  params: Promise<{ id: string }>
}

export default function EditAIExample({ params }: Props) {
  const router = useRouter()
  const { id } = use(params)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [example, setExample] = useState<AIExample | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [formData, setFormData] = useState({
    example_text: '',
    quality_score: 5
  })
  const initialDataRef = useRef<typeof formData | null>(null)

  useEffect(() => {
    async function fetchExample() {
      try {
        const { data, error } = await supabase
          .from('ai_examples')
          .select('*')
          .eq('id', id)
          .single()

        if (error) throw error

        const exampleData = data as AIExample
        setExample(exampleData)
        const loaded = {
          example_text: exampleData.example_text,
          quality_score: exampleData.quality_score
        }
        setFormData(loaded)
        initialDataRef.current = loaded
      } catch (err: any) {
        console.error('Error fetching example:', err)
        setError('Kunne ikke hente eksempel: ' + (err.message || 'Ukjent feil'))
      } finally {
        setLoading(false)
      }
    }

    fetchExample()
  }, [id])

  useEffect(() => {
    if (!initialDataRef.current) return
    const changed = JSON.stringify(formData) !== JSON.stringify(initialDataRef.current)
    setIsDirty(changed)
  }, [formData])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaveSuccess(false)

    try {
      const { error } = await supabase
        .from('ai_examples')
        .update({
          example_text: formData.example_text,
          quality_score: formData.quality_score,
          updated_at: new Date().toISOString()
        } as any)
        .eq('id', id)

      if (error) throw error

      initialDataRef.current = { ...formData }
      setIsDirty(false)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err: any) {
      console.error('Error updating example:', err)
      setError('Kunne ikke oppdatere eksempel: ' + (err.message || 'Ukjent feil'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('ai_examples')
        .delete()
        .eq('id', id)

      if (error) throw error

      router.push('/admin/ai-examples')
      router.refresh()
    } catch (err: any) {
      console.error('Error deleting example:', err)
      setError('Kunne ikke slette eksempel: ' + (err.message || 'Ukjent feil'))
      setShowDeleteConfirm(false)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          Laster...
        </p>
      </div>
    )
  }

  if (!example) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }}>
        <div className="text-center">
          <p style={{ fontFamily: 'var(--font-dm-sans)', color: C.text2, marginBottom: 16 }}>Eksempel ikke funnet</p>
          <Link href="/admin/ai-examples">
            <button
              style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.6rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: C.accent,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Tilbake
            </button>
          </Link>
        </div>
      </div>
    )
  }

  const sectionLabels: Record<string, string> = {
    goal: 'Mål',
    concept: 'Konsept'
  }

  const projectLabels: Record<string, string> = {
    event: 'Event',
    branding: 'Branding',
    documentary: 'Dokumentarisk'
  }

  return (
    <div className="min-h-screen p-8 md:p-12" style={{ background: C.bg, color: C.text }}>
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
              color: C.text3,
              textDecoration: 'none',
            }}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
            Tilbake
          </Link>

          <div className="flex items-center gap-4 mb-4">
            <div style={{ width: 32, height: 1, background: C.accent }} />
            <span style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.6rem',
              letterSpacing: '0.16em',
              color: C.accent,
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
            color: C.text,
            lineHeight: 1.1,
          }}>
            Rediger eksempel
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, marginTop: 6, letterSpacing: '0.04em' }}>
            {sectionLabels[example.section_type] || example.section_type} — {projectLabels[example.project_type] || example.project_type}
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

        {/* Success banner */}
        {saveSuccess && (
          <div
            className="flex items-center gap-3 mb-6 px-4 py-3"
            style={{ background: C.accentBg, border: '1px solid rgba(124,92,252,0.25)', borderRadius: 3 }}
          >
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.accent, letterSpacing: '0.06em' }}>
              Endringer lagret
            </p>
          </div>
        )}

        {/* Unsaved changes indicator */}
        {isDirty && !saveSuccess && (
          <div
            className="flex items-center gap-3 mb-6 px-4 py-2"
            style={{ background: 'rgba(124,92,252,0.08)', border: `1px solid ${C.border}`, borderRadius: 3 }}
          >
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.accent, flexShrink: 0 }} />
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Ulagrede endringer
            </p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSave} className="space-y-6">
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
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, marginTop: 6 }}>
              Høyere poengsum = mer sannsynlig å bli valgt av AI
            </p>
          </div>

          {/* Stats */}
          <div
            style={{
              padding: '16px 20px',
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 3,
            }}
          >
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text2, marginBottom: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Statistikk</p>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>
              Brukt {example.usage_count} ganger · Opprettet {new Date(example.created_at).toLocaleDateString('nb-NO')}
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={saving}
              style={{
                flex: 1,
                padding: '10px 20px',
                background: saving ? C.border : C.accent,
                color: saving ? C.text3 : C.bg,
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.65rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                fontWeight: 600,
                border: 'none',
                borderRadius: 3,
                cursor: saving ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {saving ? 'Lagrer...' : 'Lagre endringer'}
            </button>
            <Link href="/admin/ai-examples">
              <button
                type="button"
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  color: C.text3,
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.65rem',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  border: `1px solid ${C.border}`,
                  borderRadius: 3,
                  cursor: 'pointer',
                }}
              >
                Avbryt
              </button>
            </Link>
          </div>
        </form>

        {/* Delete zone */}
        <div
          className="mt-10 pt-8"
          style={{ borderTop: `1px solid ${C.border}` }}
        >
          {!showDeleteConfirm ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                width: '100%',
                padding: '10px 20px',
                background: 'transparent',
                color: '#8B4040',
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.6rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                border: '1px solid rgba(139,64,64,0.3)',
                borderRadius: 3,
                cursor: 'pointer',
              }}
            >
              Slett eksempel
            </button>
          ) : (
            <div
              style={{
                padding: '16px 20px',
                background: 'rgba(184,64,64,0.06)',
                border: '1px solid rgba(184,64,64,0.25)',
                borderRadius: 3,
              }}
            >
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: '#E07070', marginBottom: 12 }}>
                Er du sikker? Dette kan ikke angres.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    flex: 1,
                    padding: '8px 16px',
                    background: deleting ? C.border : 'rgba(184,64,64,0.8)',
                    color: deleting ? C.text3 : '#fff',
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '0.6rem',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    border: 'none',
                    borderRadius: 3,
                    cursor: deleting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {deleting ? 'Sletter...' : 'Bekreft sletting'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  style={{
                    padding: '8px 16px',
                    background: 'transparent',
                    color: C.text3,
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '0.6rem',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    border: `1px solid ${C.border}`,
                    borderRadius: 3,
                    cursor: 'pointer',
                  }}
                >
                  Avbryt
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
