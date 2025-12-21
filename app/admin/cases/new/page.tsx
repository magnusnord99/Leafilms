'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button, Input, Textarea, Card, Heading, Text } from '@/components/ui'

export default function NewCase() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
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

    try {
      let thumbnailPath = null

      // Last opp thumbnail hvis valgt
      if (thumbnailFile) {
        setUploading(true)
        const fileExt = thumbnailFile.name.split('.').pop()
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
        const filePath = `case-thumbnails/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('assets')
          .upload(filePath, thumbnailFile)

        if (uploadError) throw uploadError

        // Hent public URL
        const { data: { publicUrl } } = supabase.storage
          .from('assets')
          .getPublicUrl(filePath)

        thumbnailPath = publicUrl
        setUploading(false)
      }

      // Ekstraherer Vimeo ID fra URL
      const vimeoId = extractVimeoId(formData.vimeo_url)

      // Parse tags (komma-separert)
      const tagsArray = formData.tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0)

      // Opprett case study
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

      // Case opprettet
      router.push('/admin/cases')
      router.refresh()
    } catch (error) {
      console.error('Error creating case:', error)
      alert('❌ Kunne ikke opprette case')
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
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <Button
            variant="ghost"
            onClick={() => router.push('/admin/cases')}
            className="mb-4 -ml-2"
          >
            ← Tilbake
          </Button>
          <Heading as="h1" size="lg" className="mb-2">Nytt Case</Heading>
          <Text variant="muted">Legg til et tidligere arbeid</Text>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <Input
            label="Tittel *"
            type="text"
            required
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="NETFLIX"
          />

          {/* Description */}
          <Textarea
            label="Beskrivelse *"
            required
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Netflix skulle lansere kommende nyheter..."
            rows={4}
          />

          {/* Vimeo URL */}
          <Input
            label="Vimeo URL *"
            type="url"
            required
            value={formData.vimeo_url}
            onChange={(e) => setFormData({ ...formData, vimeo_url: e.target.value })}
            placeholder="https://vimeo.com/123456"
          />

          {/* Thumbnail Upload */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-300">
              Thumbnail-bilde
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleThumbnailChange}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-zinc-700 file:text-white hover:file:bg-zinc-600"
            />
            {thumbnailPreview && (
              <div className="mt-4">
                <img
                  src={thumbnailPreview}
                  alt="Preview"
                  className="w-full aspect-video object-cover rounded-lg"
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
              placeholder="commercial, event, sport"
            />
            <Text variant="muted" className="mt-2">
              Bruk tags for enklere søk og filtrering senere
            </Text>
          </div>

          {/* Info */}
          <Card className="bg-blue-500/5 border-blue-500/20">
            <Text variant="small" className="text-blue-300">
              💡 Dette caset kan gjenbrukes i flere prosjekter
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
              {uploading ? 'Laster opp bilde...' : loading ? 'Oppretter...' : 'Opprett Case'}
            </Button>
            <Button
              type="button"
              onClick={() => router.push('/admin/cases')}
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

