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

export default function NewTeamMember() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    bio: '',
    email: '',
    phone: '',
    tags: '',
    daily_rate: ''
  })
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null)
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null)

  const handleProfileImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setProfileImageFile(file)
      setProfileImagePreview(URL.createObjectURL(file))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      let profileImagePath = null

      if (profileImageFile) {
        setUploading(true)
        const fileExt = profileImageFile.name.split('.').pop()
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
        const filePath = `team-profiles/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('assets')
          .upload(filePath, profileImageFile)

        if (uploadError) throw uploadError

        profileImagePath = filePath
        setUploading(false)
      }

      const tagsArray = formData.tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0)

      const { error } = await supabase
        .from('team_members')
        .insert({
          name: formData.name,
          role: formData.role,
          bio: formData.bio || null,
          email: formData.email || null,
          phone: formData.phone || null,
          profile_image_path: profileImagePath,
          tags: tagsArray,
          daily_rate: formData.daily_rate ? Number(formData.daily_rate) : null
        })

      if (error) throw error

      router.push('/admin/team')
      router.refresh()
    } catch (err: any) {
      console.error('Error creating team member:', err)
      setError('Kunne ikke opprette team-medlem: ' + (err.message || 'Ukjent feil'))
    } finally {
      setLoading(false)
      setUploading(false)
    }
  }

  return (
    <div className="min-h-screen p-8 md:p-12" style={{ background: C.bg, color: C.text }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <Link
            href="/admin/team"
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
              Team
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
            Nytt team-medlem
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, marginTop: 6, letterSpacing: '0.04em' }}>
            Legg til et team-medlem som kan gjenbrukes i prosjekter
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
            {fieldLabel('Navn', true)}
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ola Nordmann"
              style={inputStyle}
            />
          </div>

          <div>
            {fieldLabel('Rolle', true)}
            <input
              type="text"
              required
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              placeholder="Director, Producer, Photographer..."
              style={inputStyle}
            />
          </div>

          <div>
            {fieldLabel('Bio')}
            <textarea
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              placeholder="Beskrivelse av personen og deres bakgrunn..."
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <div>
            {fieldLabel('E-post')}
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="ola@leafilms.no"
              style={inputStyle}
            />
          </div>

          <div>
            {fieldLabel('Telefon')}
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+47 123 45 678"
              style={inputStyle}
            />
          </div>

          {/* Profile Image */}
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
              Profilbilde
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleProfileImageChange}
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
            {profileImagePreview && (
              <div className="mt-4">
                <img
                  src={profileImagePreview}
                  alt="Forhåndsvisning"
                  className="w-24 h-24 rounded-full object-cover"
                  style={{ border: `1px solid ${C.border}` }}
                />
              </div>
            )}
          </div>

          <div>
            {fieldLabel('Dagsats (NOK)')}
            <input
              type="number"
              value={formData.daily_rate}
              onChange={(e) => setFormData({ ...formData, daily_rate: e.target.value })}
              placeholder="8000"
              style={inputStyle}
            />
          </div>

          <div>
            {fieldLabel('Tags (komma-separert)')}
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              placeholder="director, producer, photographer"
              style={inputStyle}
            />
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, marginTop: 6 }}>
              Bruk tags for enklere søk og filtrering
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading || uploading || !formData.name || !formData.role}
              style={{
                flex: 1,
                padding: '10px 20px',
                background: (loading || uploading || !formData.name || !formData.role) ? C.border : C.accent,
                color: (loading || uploading || !formData.name || !formData.role) ? C.text3 : C.bg,
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
              {uploading ? 'Laster opp bilde...' : loading ? 'Oppretter...' : 'Opprett team-medlem'}
            </button>
            <Link href="/admin/team">
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
