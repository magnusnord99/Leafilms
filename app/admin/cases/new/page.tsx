'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
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

export default function NewCase() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    vimeo_url: '',
    tags: ''
  })
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null)
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null)

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setThumbnailFile(file)
      setThumbnailPreview(URL.createObjectURL(file))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      let thumbnailPath = null

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
        .insert({
          title: formData.title,
          description: formData.description,
          vimeo_url: formData.vimeo_url,
          vimeo_id: vimeoId,
          thumbnail_path: thumbnailPath,
          tags: tagsArray
        })

      if (error) throw error

      router.push('/admin/cases')
      router.refresh()
    } catch (err: any) {
      console.error('Error creating case:', err)
      setError('Kunne ikke opprette case: ' + (err.message || 'Ukjent feil'))
    } finally {
      setLoading(false)
      setUploading(false)
    }
  }

  function extractVimeoId(url: string): string | null {
    const match = url.match(/vimeo\.com\/(\d+)/)
    return match ? match[1] : null
  }

  return (
    <div className="min-h-screen p-8 md:p-12" style={{ background: C.bg, color: C.text }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <Link
            href="/admin/cases"
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
            Nytt case
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, marginTop: 6, letterSpacing: '0.04em' }}>
            Legg til et tidligere arbeid som kan gjenbrukes i prosjekter
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
                  alt="Forhåndsvisning"
                  className="w-full aspect-video object-cover"
                  style={{ borderRadius: 3, border: `1px solid ${C.border}` }}
                />
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
              disabled={loading || uploading || !formData.title || !formData.description || !formData.vimeo_url}
              style={{
                flex: 1,
                padding: '10px 20px',
                background: (loading || uploading || !formData.title || !formData.description || !formData.vimeo_url) ? C.border : C.accent,
                color: (loading || uploading || !formData.title || !formData.description || !formData.vimeo_url) ? C.text3 : C.bg,
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.65rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                fontWeight: 600,
                border: 'none',
                borderRadius: 3,
                cursor: (loading || uploading) ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {uploading ? 'Laster opp bilde...' : loading ? 'Oppretter...' : 'Opprett case'}
            </button>
            <Link href="/admin/cases">
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
