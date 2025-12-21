'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button, Input, Textarea, Card, Heading, Text } from '@/components/ui'

export default function NewTeamMember() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
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

    try {
      let profileImagePath = null

      // Last opp profilbilde hvis valgt
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

      // Opprett team-medlem
      const { error } = await supabase
        .from('team_members')
        .insert({
          name: formData.name,
          role: formData.role,
          bio: formData.bio || null,
          email: formData.email || null,
          phone: formData.phone || null,
          profile_image_path: profileImagePath,
          tags: tagsArray
        })

      if (error) throw error

      // Team-medlem opprettet
      router.push('/admin/team')
      router.refresh()
    } catch (error) {
      console.error('Error creating team member:', error)
      alert('❌ Kunne ikke opprette team-medlem')
    } finally {
      setLoading(false)
      setUploading(false)
    }
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
          <Heading as="h1" size="lg" className="mb-2">Nytt Team-medlem</Heading>
          <Text variant="muted">Legg til et team-medlem</Text>
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
            <input
              type="file"
              accept="image/*"
              onChange={handleProfileImageChange}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-zinc-700 file:text-white hover:file:bg-zinc-600"
            />
            {profileImagePreview && (
              <div className="mt-4">
                <img
                  src={profileImagePreview}
                  alt="Preview"
                  className="w-32 h-32 rounded-full object-cover"
                />
              </div>
            )}
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

          {/* Info */}
          <Card className="bg-blue-500/5 border-blue-500/20">
            <Text variant="small" className="text-blue-300">
              💡 Dette team-medlemmet kan gjenbrukes i flere prosjekter
            </Text>
          </Card>

          {/* Submit */}
          <div className="flex gap-4">
            <Button
              type="submit"
              disabled={loading || uploading}
              variant="primary"
              className="flex-1"
            >
              {uploading ? 'Laster opp bilde...' : loading ? 'Oppretter...' : 'Opprett Team-medlem'}
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

