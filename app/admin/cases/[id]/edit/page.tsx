'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { CaseStudy } from '@/lib/types'
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

export default function EditCase({ params }: Props) {
  const [id, setId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    vimeo_url: '',
    tags: ''
  })
  const initialDataRef = useRef<typeof formData | null>(null)
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null)
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null)
  const [existingThumbnail, setExistingThumbnail] = useState<string | null>(null)

  useEffect(() => {
    params.then((resolvedParams) => {
      setId(resolvedParams.id)
    })
  }, [params])

  useEffect(() => {
    if (id) {
      // Nullstill valgt-men-ikke-lagret fil fra forrige case — ellers kan den
      // bli lastet opp og lagret som miniatyrbilde for FEIL case ved navigering.
      setThumbnailFile(null)
      setThumbnailPreview(null)
      fetchCase()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (!initialDataRef.current) return
    const changed = JSON.stringify(formData) !== JSON.stringify(initialDataRef.current) || !!thumbnailFile
    setIsDirty(changed)
  }, [formData, thumbnailFile])

  async function fetchCase() {
    if (!id) return

    try {
      const { data, error } = await supabase
        .from('case_studies')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error

      if (data) {
        const caseStudy = data as CaseStudy
        const loaded = {
          title: caseStudy.title,
          description: caseStudy.description,
          vimeo_url: caseStudy.vimeo_url,
          tags: caseStudy.tags?.join(', ') || ''
        }
        setFormData(loaded)
        initialDataRef.current = loaded
        setExistingThumbnail(caseStudy.thumbnail_path || null)
      }
    } catch (err) {
      console.error('Error fetching case:', err)
      setError('Kunne ikke hente case: ' + (err instanceof Error ? err.message : 'Ukjent feil'))
    } finally {
      setLoading(false)
    }
  }

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setThumbnailFile(file)
      setThumbnailPreview(URL.createObjectURL(file))
      setExistingThumbnail(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return

    setSaving(true)
    setError(null)
    setSaveSuccess(false)

    try {
      let thumbnailPath = existingThumbnail

      if (thumbnailFile) {
        setUploading(true)
        const fileExt = thumbnailFile.name.split('.').pop()
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
        const filePath = `case-thumbnails/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('assets')
          .upload(filePath, thumbnailFile)

        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage
          .from('assets')
          .getPublicUrl(filePath)

        thumbnailPath = publicUrl
        setUploading(false)
      }

      const vimeoId = extractVimeoId(formData.vimeo_url)

      const tagsArray = formData.tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0)

      const { error } = await supabase
        .from('case_studies')
        .update({
          title: formData.title,
          description: formData.description,
          vimeo_url: formData.vimeo_url,
          vimeo_id: vimeoId,
          thumbnail_path: thumbnailPath,
          tags: tagsArray,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)

      if (error) throw error

      initialDataRef.current = { ...formData }
      setThumbnailFile(null)
      setIsDirty(false)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      console.error('Error updating case:', err)
      setError('Kunne ikke oppdatere case: ' + (err instanceof Error ? err.message : 'Ukjent feil'))
    } finally {
      setSaving(false)
      setUploading(false)
    }
  }

  function extractVimeoId(url: string): string | null {
    const match = url.match(/vimeo\.com\/(\d+)/)
    return match ? match[1] : null
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

  return (
    <div className="min-h-screen p-8 md:p-12" style={{ background: C.bg, color: C.text }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <Link
            href="/admin/pitches/cases"
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
              Cases
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
            Rediger case
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, marginTop: 6, letterSpacing: '0.04em' }}>
            Oppdater case study
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
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            {fieldLabel('Tittel', true)}
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="NETFLIX"
              style={inputStyle}
            />
          </div>

          <div>
            {fieldLabel('Beskrivelse', true)}
            <textarea
              required
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Netflix skulle lansere kommende nyheter..."
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <div>
            {fieldLabel('Vimeo URL', true)}
            <input
              type="url"
              required
              value={formData.vimeo_url}
              onChange={(e) => setFormData({ ...formData, vimeo_url: e.target.value })}
              placeholder="https://vimeo.com/123456"
              style={inputStyle}
            />
          </div>

          {/* Thumbnail */}
          <div>
            <label style={{
              display: 'block',
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.6rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: C.text2,
              fontWeight: 500,
              marginBottom: 6,
            }}>
              Thumbnail-bilde
            </label>
            {existingThumbnail && !thumbnailPreview && (
              <div className="mb-4">
                <img
                  src={existingThumbnail}
                  alt="Nåværende thumbnail"
                  className="w-full aspect-video object-cover"
                  style={{ borderRadius: 3, border: `1px solid ${C.border}` }}
                />
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, marginTop: 6 }}>Nåværende thumbnail</p>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleThumbnailChange}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 3,
                color: C.text2,
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            />
            {thumbnailPreview && (
              <div className="mt-4">
                <img
                  src={thumbnailPreview}
                  alt="Ny thumbnail"
                  className="w-full aspect-video object-cover"
                  style={{ borderRadius: 3, border: `1px solid ${C.border}` }}
                />
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, marginTop: 6 }}>Ny thumbnail (erstatter eksisterende)</p>
              </div>
            )}
          </div>

          <div>
            {fieldLabel('Tags (komma-separert)')}
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              placeholder="commercial, event, sport"
              style={inputStyle}
            />
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, marginTop: 6 }}>
              Bruk tags for enklere søk og filtrering
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={saving || uploading}
              style={{
                flex: 1,
                padding: '10px 20px',
                background: (saving || uploading) ? C.border : C.accent,
                color: (saving || uploading) ? C.text3 : C.bg,
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.65rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                fontWeight: 600,
                border: 'none',
                borderRadius: 3,
                cursor: (saving || uploading) ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {uploading ? 'Laster opp bilde...' : saving ? 'Lagrer...' : 'Lagre endringer'}
            </button>
            <Link href="/admin/pitches/cases">
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
      </div>
    </div>
  )
}
