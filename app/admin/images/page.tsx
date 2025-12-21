'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button, Card, Heading, Text, Input } from '@/components/ui'
import { Image } from '@/lib/types'

export default function ImagesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [images, setImages] = useState<Image[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('all')

  // Kategorier (kan utvides senere)
  const categories = [
    { value: 'all', label: 'Alle kategorier' },
    { value: 'landskap', label: 'Landskap' },
    { value: 'sport', label: 'Sport' },
    { value: 'closeup', label: 'Close-up' },
    { value: 'portrett', label: 'Portrett' },
    { value: 'event', label: 'Event' },
    { value: 'kommersiell', label: 'Kommersiell' },
    { value: 'abstrakt', label: 'Abstrakt' },
    { value: 'bts', label: 'Behind The Scenes' }
  ]

  useEffect(() => {
    fetchImages()
  }, [])

  async function fetchImages() {
    try {
      let query = supabase
        .from('images')
        .select('*')
        .order('created_at', { ascending: false })

      // Filtrer på kategori
      if (selectedCategory !== 'all') {
        query = query.eq('category', selectedCategory)
      }

      // Filtrer på subcategory hvis valgt
      if (selectedSubcategory !== 'all' && selectedSubcategory !== '') {
        query = query.eq('subcategory', selectedSubcategory)
      }

      // Søk i title, description og tags
      if (searchQuery.trim()) {
        query = query.or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%,tags.cs.{${searchQuery}}`)
      }

      const { data, error } = await query

      if (error) throw error
      setImages((data || []) as Image[])
    } catch (error) {
      console.error('Error fetching images:', error)
      alert('Kunne ikke hente bilder')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchImages()
  }, [selectedCategory, selectedSubcategory, searchQuery])

  async function handleDelete(imageId: string, imageTitle: string) {
    if (!confirm(`Er du sikker på at du vil slette "${imageTitle || 'dette bildet'}"?\n\nDette kan ikke angres.`)) {
      return
    }

    try {
      // Hent bildeinfo for å slette fra storage
      const { data: imageData } = await supabase
        .from('images')
        .select('file_path')
        .eq('id', imageId)
        .single()

      // Slett fra database
      const { error: dbError } = await supabase
        .from('images')
        .delete()
        .eq('id', imageId)

      if (dbError) throw dbError

      // Slett fra storage hvis file_path finnes
      if (imageData?.file_path) {
        const pathParts = imageData.file_path.split('/')
        const fileName = pathParts[pathParts.length - 1]
        const storagePath = `images/${fileName}`
        
        await supabase.storage
          .from('assets')
          .remove([storagePath])
      }

      // Bilde slettet
      fetchImages()
    } catch (error) {
      console.error('Error deleting image:', error)
      alert('❌ Kunne ikke slette bilde')
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
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <Button
            variant="ghost"
            onClick={() => router.push('/admin')}
            className="mb-4 -ml-2"
          >
            ← Tilbake til admin
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <Heading as="h1" size="lg" className="mb-2">Bildebibliotek</Heading>
              <Text variant="muted">Administrer bilder for gjenbruk i prosjekter</Text>
            </div>
            <div className="flex gap-3">
              <Link href="/admin/images/presets">
                <Button variant="secondary">📷 Bilde-sett</Button>
              </Link>
              <Link href="/admin/images/new">
                <Button variant="primary">+ Last opp bilde</Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Søk og filtrering */}
        <div className="mb-8 space-y-4">
          {/* Søk */}
          <Input
            type="text"
            placeholder="Søk på tittel, beskrivelse eller tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />

          {/* Kategori-filter */}
          <div className="flex gap-4 flex-wrap">
            {categories.map((cat) => (
              <Button
                key={cat.value}
                variant={selectedCategory === cat.value ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => {
                  setSelectedCategory(cat.value)
                  setSelectedSubcategory('all')
                }}
              >
                {cat.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Images Grid */}
        {images && images.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {images.map((image) => {
              const imageUrl = supabase.storage
                .from('assets')
                .getPublicUrl(image.file_path)

              return (
                <Card key={image.id} className="overflow-hidden p-0">
                  {/* Thumbnail */}
                  <div className="aspect-square bg-zinc-800 flex items-center justify-center">
                    <img
                      src={imageUrl.data.publicUrl}
                      alt={image.title || image.filename}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <Heading as="h3" size="sm" className="mb-2 line-clamp-1">
                      {image.title || image.filename}
                    </Heading>
                    
                    {/* Category badges */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className="text-xs px-2 py-1 bg-zinc-800 rounded text-gray-400">
                        {image.category}
                      </span>
                      {image.subcategory && (
                        <span className="text-xs px-2 py-1 bg-zinc-800 rounded text-gray-400">
                          {image.subcategory}
                        </span>
                      )}
                    </div>

                    {/* Tags */}
                    {image.tags && image.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {image.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="text-xs px-2 py-1 bg-zinc-900 rounded text-gray-500"
                          >
                            {tag}
                          </span>
                        ))}
                        {image.tags.length > 3 && (
                          <span className="text-xs text-gray-500">+{image.tags.length - 3}</span>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(image.id, image.title || image.filename)}
                        className="flex-1"
                      >
                        🗑️ Slett
                      </Button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <Text variant="body" className="mb-4">Ingen bilder ennå</Text>
            <Link href="/admin/images/new">
              <Button variant="primary">Last opp første bilde</Button>
            </Link>
          </Card>
        )}
      </div>
    </div>
  )
}

