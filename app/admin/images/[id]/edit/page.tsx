'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button, Input, Textarea, Card, Heading, Text } from '@/components/ui'
import { Image } from '@/lib/types'
import { IMAGE_CATEGORIES, categoryLabel } from '@/lib/image-categories'

type Props = {
  params: Promise<{ id: string }>
}

const categories = IMAGE_CATEGORIES

export default function EditImagePage({ params }: Props) {
  const router = useRouter()
  const [id, setId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [image, setImage] = useState<Image | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'landskap',
    subcategory: '',
    tags: ''
  })

  useEffect(() => {
    params.then((p) => setId(p.id))
  }, [params])

  useEffect(() => {
    if (id) fetchImage()
  }, [id])

  async function fetchImage() {
    if (!id) return
    try {
      const { data, error } = await supabase
        .from('images')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error

      const img = data as Image
      setImage(img)
      setFormData({
        title: img.title || '',
        description: img.description || '',
        category: img.category,
        subcategory: img.subcategory || '',
        tags: img.tags?.join(', ') || ''
      })
    } catch (error) {
      console.error('Error fetching image:', error)
      alert('Kunne ikke hente bilde')
      router.push('/admin/pitches/images')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return

    setSaving(true)
    try {
      const tagsArray = formData.tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0)

      const { error } = await supabase
        .from('images')
        .update({
          title: formData.title || null,
          description: formData.description || null,
          category: formData.category,
          subcategory: formData.subcategory || null,
          tags: tagsArray
        })
        .eq('id', id)

      if (error) throw error

      router.push('/admin/pitches/images')
      router.refresh()
    } catch (error) {
      console.error('Error saving image:', error)
      alert('Kunne ikke lagre endringer')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Text variant="body">Laster...</Text>
      </div>
    )
  }

  if (!image) return null

  const imageUrl = supabase.storage.from('assets').getPublicUrl(image.file_path).data.publicUrl
  const subcategoryOptions = categories[formData.category as keyof typeof categories] || []

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-12">
          <Button
            variant="ghost"
            onClick={() => router.push('/admin/pitches/images')}
            className="mb-4 -ml-2"
          >
            ← Tilbake
          </Button>
          <Heading as="h1" size="lg" className="mb-2">Rediger bilde</Heading>
          <Text variant="muted">{image.filename}</Text>
        </div>

        {/* Forhåndsvisning */}
        <Card className="mb-6 p-0 overflow-hidden">
          <img
            src={imageUrl}
            alt={image.title || image.filename}
            className="w-full max-h-64 object-contain bg-zinc-900"
          />
        </Card>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            label="Tittel (valgfritt)"
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="F.eks. Fjelltopp i Lofoten"
          />

          <Textarea
            label="Beskrivelse (valgfritt)"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Beskriv bildet..."
            rows={3}
          />

          <div>
            <Text variant="body" className="mb-2 block">Kategori</Text>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value, subcategory: '' })}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-4 py-2 text-white"
            >
              {Object.keys(categories).map((cat) => (
                <option key={cat} value={cat}>
                  {categoryLabel(cat)}
                </option>
              ))}
            </select>
          </div>

          {subcategoryOptions.length > 0 && (
            <div>
              <Text variant="body" className="mb-2 block">Underkategori (valgfritt)</Text>
              <select
                value={formData.subcategory}
                onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-4 py-2 text-white"
              >
                <option value="">Ingen underkategori</option>
                {subcategoryOptions.map((subcat) => (
                  <option key={subcat} value={`${formData.category}/${subcat}`}>
                    {subcat.charAt(0).toUpperCase() + subcat.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <Input
              label="Tags (komma-separert)"
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              placeholder="F.eks. sommer, utendørs, action"
            />
            {formData.tags && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.tags.split(',').map(t => t.trim()).filter(t => t).map((tag) => (
                  <span key={tag} className="text-xs px-2 py-1 bg-zinc-800 rounded text-gray-400">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-4 pt-2">
            <Button
              type="submit"
              variant="primary"
              disabled={saving}
              className="flex-1"
            >
              {saving ? 'Lagrer...' : 'Lagre endringer'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push('/admin/pitches/images')}
            >
              Avbryt
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
