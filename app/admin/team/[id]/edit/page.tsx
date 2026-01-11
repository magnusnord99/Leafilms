'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button, Input, Textarea, Card, Heading, Text } from '@/components/ui'
import { TeamMember } from '@/lib/types'

type Props = {
  params: Promise<{ id: string }>
}

export default function EditTeamMember({ params }: Props) {
  const router = useRouter()
  const { id } = use(params)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    bio: '',
    email: '',
    phone: '',
    tags: ''
  })
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null)
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null)
  const [existingProfileImage, setExistingProfileImage] = useState<string | null>(null)

  useEffect(() => {
    if (id) {
      fetchTeamMember()
    }
  }, [id])

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
        setFormData({
          name: teamMember.name || '',
          role: teamMember.role || '',
          bio: teamMember.bio || '',
          email: teamMember.email || '',
          phone: teamMember.phone || '',
          tags: teamMember.tags?.join(', ') || ''
        })

        // Sett eksisterende profilbilde hvis det finnes
        if (teamMember.profile_image_path) {
          const imageUrl = supabase.storage
            .from('assets')
            .getPublicUrl(teamMember.profile_image_path).data.publicUrl
          setExistingProfileImage(imageUrl)
        }
      }
    } catch (error) {
      console.error('Error fetching team member:', error)
      alert('❌ Kunne ikke laste team-medlem')
      router.push('/admin/team')
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

    try {
      let profileImagePath = null

      // Hvis nytt bilde er valgt, last det opp
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

      // Parse tags (komma-separert)
      const tagsArray = formData.tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0)

      // Oppdater team-medlem
      const updateData: any = {
        name: formData.name,
        role: formData.role,
        bio: formData.bio || null,
        email: formData.email || null,
        phone: formData.phone || null,
        tags: tagsArray
      }

      // Legg til profilbilde-path hvis nytt bilde er lastet opp
      if (profileImagePath) {
        updateData.profile_image_path = profileImagePath
      }

      const { error } = await supabase
        .from('team_members')
        .update(updateData)
        .eq('id', id)

      if (error) throw error

      // Team-medlem oppdatert
      router.push('/admin/team')
      router.refresh()
    } catch (error) {
      console.error('Error updating team member:', error)
      alert('❌ Kunne ikke oppdatere team-medlem')
    } finally {
      setSaving(false)
      setUploading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Text variant="body">Laster...</Text>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <Button
            variant="ghost"
            onClick={() => router.push('/admin/team')}
            className="mb-4 -ml-2"
          >
            ← Tilbake
          </Button>
          <Heading as="h1" size="lg" className="mb-2">Rediger Team-medlem</Heading>
          <Text variant="muted">Oppdater informasjon om team-medlemmet</Text>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <Input
            label="Navn *"
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Ola Nordmann"
          />

          {/* Role */}
          <Input
            label="Rolle *"
            type="text"
            required
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            placeholder="Director, Producer, Photographer..."
          />

          {/* Bio */}
          <Textarea
            label="Bio"
            value={formData.bio}
            onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
            placeholder="Beskrivelse av personen og deres bakgrunn..."
            rows={4}
          />

          {/* Email */}
          <Input
            label="E-post"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="ola@leafilms.no"
          />

          {/* Phone */}
          <Input
            label="Telefon"
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="+47 123 45 678"
          />

          {/* Profile Image Upload */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-300">
              Profilbilde
            </label>
            {existingProfileImage && !profileImagePreview && (
              <div className="mb-4">
                <Text variant="small" className="mb-2 block">Nåværende bilde:</Text>
                <img
                  src={existingProfileImage}
                  alt="Current profile"
                  className="w-32 h-32 rounded-full object-cover"
                />
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleProfileImageChange}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-zinc-700 file:text-white hover:file:bg-zinc-600"
            />
            {profileImagePreview && (
              <div className="mt-4">
                <Text variant="small" className="mb-2 block">Nytt bilde:</Text>
                <img
                  src={profileImagePreview}
                  alt="Preview"
                  className="w-32 h-32 rounded-full object-cover"
                />
              </div>
            )}
            <Text variant="muted" className="mt-2">
              La stå tomt for å beholde eksisterende bilde
            </Text>
          </div>

          {/* Tags */}
          <div>
            <Input
              label="Tags (komma-separert)"
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              placeholder="director, producer, photographer"
            />
            <Text variant="muted" className="mt-2">
              Bruk tags for enklere søk og filtrering senere
            </Text>
          </div>

          {/* Submit */}
          <div className="flex gap-4">
            <Button
              type="submit"
              disabled={saving || uploading}
              variant="primary"
              className="flex-1"
            >
              {uploading ? 'Laster opp bilde...' : saving ? 'Lagrer...' : 'Lagre endringer'}
            </Button>
            <Button
              type="button"
              onClick={() => router.push('/admin/team')}
              variant="secondary"
            >
              Avbryt
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
