'use client'

import { useState, useEffect, use, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { TeamMember } from '@/lib/types'
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

export default function EditTeamMember({ params }: Props) {
  const { id } = use(params)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    bio: '',
    email: '',
    phone: '',
    tags: '',
    daily_rate: ''
  })
  const initialDataRef = useRef<typeof formData | null>(null)
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null)
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null)
  const [existingProfileImage, setExistingProfileImage] = useState<string | null>(null)

  useEffect(() => {
    if (id) {
      fetchTeamMember()
    }
  }, [id])

  useEffect(() => {
    if (!initialDataRef.current) return
    const changed = JSON.stringify(formData) !== JSON.stringify(initialDataRef.current) || !!profileImageFile
    setIsDirty(changed)
  }, [formData, profileImageFile])

  async function fetchTeamMember() {
    if (!id) return

    try {
      const { data, error } = await supabase
        .from('team_members')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error

      if (data) {
        const teamMember = data as TeamMember
        const loaded = {
          name: teamMember.name || '',
          role: teamMember.role || '',
          bio: teamMember.bio || '',
          email: teamMember.email || '',
          phone: teamMember.phone || '',
          tags: teamMember.tags?.join(', ') || '',
          daily_rate: teamMember.daily_rate != null ? String(teamMember.daily_rate) : ''
        }
        setFormData(loaded)
        initialDataRef.current = loaded

        if (teamMember.profile_image_path) {
          const imageUrl = supabase.storage
            .from('assets')
            .getPublicUrl(teamMember.profile_image_path).data.publicUrl
          setExistingProfileImage(imageUrl)
        }
      }
    } catch (err) {
      console.error('Error fetching team member:', err)
      setError('Kunne ikke laste team-medlem: ' + (err instanceof Error ? err.message : 'Ukjent feil'))
    } finally {
      setLoading(false)
    }
  }

  const handleProfileImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setProfileImageFile(file)
      setProfileImagePreview(URL.createObjectURL(file))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaveSuccess(false)

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

      type TeamMemberUpdate = {
        name: string
        role: string
        bio: string | null
        email: string | null
        phone: string | null
        tags: string[]
        daily_rate: number | null
        profile_image_path?: string
      }

      const updateData: TeamMemberUpdate = {
        name: formData.name,
        role: formData.role,
        bio: formData.bio || null,
        email: formData.email || null,
        phone: formData.phone || null,
        tags: tagsArray,
        daily_rate: formData.daily_rate ? Number(formData.daily_rate) : null
      }

      if (profileImagePath) {
        updateData.profile_image_path = profileImagePath
      }

      const { error } = await supabase
        .from('team_members')
        .update(updateData)
        .eq('id', id)

      if (error) throw error

      initialDataRef.current = { ...formData }
      setProfileImageFile(null)
      setIsDirty(false)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      console.error('Error updating team member:', err)
      setError('Kunne ikke oppdatere team-medlem: ' + (err instanceof Error ? err.message : 'Ukjent feil'))
    } finally {
      setSaving(false)
      setUploading(false)
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
            Rediger team-medlem
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, marginTop: 6, letterSpacing: '0.04em' }}>
            Oppdater informasjon om team-medlemmet
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
            {existingProfileImage && !profileImagePreview && (
              <div className="mb-4">
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, marginBottom: 8 }}>Nåværende bilde:</p>
                <img
                  src={existingProfileImage}
                  alt="Nåværende profilbilde"
                  className="w-24 h-24 rounded-full object-cover"
                  style={{ border: `1px solid ${C.border}` }}
                />
              </div>
            )}
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
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, marginBottom: 8 }}>Nytt bilde:</p>
                <img
                  src={profileImagePreview}
                  alt="Ny profilbilde forhåndsvisning"
                  className="w-24 h-24 rounded-full object-cover"
                  style={{ border: `1px solid ${C.border}` }}
                />
              </div>
            )}
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, marginTop: 6 }}>
              La stå tomt for å beholde eksisterende bilde
            </p>
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
