'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button, Input, Textarea, Card, Heading, Text } from '@/components/ui'
import { CaseStudy } from '@/lib/types'

type Props = {
  params: Promise<{ id: string }>
}

export default function EditCase({ params }: Props) {
  const router = useRouter()
  const [id, setId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    vimeo_url: '',
    tags: ''
  })
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null)
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null)
  const [existingThumbnail, setExistingThumbnail] = useState<string | null>(null)

  // Resolve params Promise
  useEffect(() => {
    params.then((resolvedParams) => {
      setId(resolvedParams.id)
    })
  }, [params])

  useEffect(() => {
    if (id) {
      fetchCase()
    }
  }, [id])

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
        setFormData({
          title: caseStudy.title,
          description: caseStudy.description,
          vimeo_url: caseStudy.vimeo_url,
          tags: caseStudy.tags?.join(', ') || ''
        })
        if (caseStudy.thumbnail_path) {
          setExistingThumbnail(caseStudy.thumbnail_path)
        }
      }
    } catch (error) {
      console.error('Error fetching case:', error)
      alert('❌ Kunne ikke hente case')
      router.push('/admin/cases')
    } finally {
      setLoading(false)
    }
  }

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setThumbnailFile(file)
      setThumbnailPreview(URL.createObjectURL(file))
      setExistingThumbnail(null) // Clear existing thumbnail when new one is selected
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return
    
    setSaving(true)

    try {
      let thumbnailPath = existingThumbnail

      // Last opp ny thumbnail hvis valgt
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

      // Oppdater case study
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

      // Case oppdatert
      router.push('/admin/cases')
      router.refresh()
    } catch (error) {
      console.error('Error updating case:', error)
      alert('❌ Kunne ikke oppdatere case')
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
            onClick={() => router.push('/admin/cases')}
            className="mb-4 -ml-2"
          >
            ← Tilbake
          </Button>
          <Heading as="h1" size="lg" className="mb-2">Rediger Case</Heading>
          <Text variant="muted">Oppdater case study</Text>
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
            {existingThumbnail && !thumbnailPreview && (
              <div className="mb-4">
                <img
                  src={existingThumbnail}
                  alt="Current thumbnail"
                  className="w-full aspect-video object-cover rounded-lg"
                />
                <Text variant="small" className="mt-2 text-gray-400">
                  Nåværende thumbnail
                </Text>
              </div>
            )}
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
                <Text variant="small" className="mt-2 text-gray-400">
                  Ny thumbnail (vil erstatte eksisterende)
                </Text>
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

