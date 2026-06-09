'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button, Input } from '@/components/ui'
import { Image } from '@/lib/types'
import { C } from '@/lib/admin-theme'

const sectionLabel = (text: string) => (
  <span style={{
    fontFamily: 'var(--font-dm-sans)',
    fontSize: '0.6rem',
    letterSpacing: '0.16em',
    color: C.accent,
    textTransform: 'uppercase' as const,
    fontWeight: 500,
  }}>
    {text}
  </span>
)

export default function ImagesPage() {
  const [loading, setLoading] = useState(true)
  const [images, setImages] = useState<Image[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('all')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Kategorier (kan utvides senere)
  const categories = [
    { value: 'all', label: 'Alle' },
    { value: 'landskap', label: 'Landskap' },
    { value: 'sport', label: 'Sport' },
    { value: 'closeup', label: 'Close-up' },
    { value: 'portrett', label: 'Portrett' },
    { value: 'event', label: 'Event' },
    { value: 'kommersiell', label: 'Kommersiell' },
    { value: 'abstrakt', label: 'Abstrakt' },
    { value: 'bts', label: 'Behind The Scenes' }
  ]

  async function fetchImages() {
    try {
      let query = supabase
        .from('images')
        .select('id, filename, file_path, title, category, subcategory, tags')
        .order('created_at', { ascending: false })

      if (selectedCategory !== 'all') {
        query = query.eq('category', selectedCategory)
      }

      if (selectedSubcategory !== 'all' && selectedSubcategory !== '') {
        query = query.eq('subcategory', selectedSubcategory)
      }

      if (searchQuery.trim()) {
        query = query.or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%,tags.cs.{${searchQuery}}`)
      }

      const { data, error } = await query

      if (error) throw error
      setImages((data || []) as Image[])
    } catch (error) {
      console.error('Error fetching images:', error)
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
    setDeletingId(imageId)
    setDeleteError(null)
    try {
      const { data: imageData } = await supabase
        .from('images')
        .select('file_path')
        .eq('id', imageId)
        .single()

      const { error: dbError } = await supabase
        .from('images')
        .delete()
        .eq('id', imageId)

      if (dbError) throw dbError

      if (imageData?.file_path) {
        const pathParts = imageData.file_path.split('/')
        const fileName = pathParts[pathParts.length - 1]
        const storagePath = `images/${fileName}`

        await supabase.storage
          .from('assets')
          .remove([storagePath])
      }

      fetchImages()
    } catch (error) {
      console.error('Error deleting image:', error)
      setDeleteError('Kunne ikke slette bilde. Prøv igjen.')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }}>
        <div className="flex items-center gap-3">
          <div style={{ width: 1, height: 24, background: C.accent, opacity: 0.5 }} />
          <p style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.6rem',
            letterSpacing: '0.16em',
            color: C.text3,
            textTransform: 'uppercase',
          }}>
            Laster...
          </p>
        </div>
      </div>
    )
  }

  const noResults = images.length === 0
  const isFiltered = searchQuery || selectedCategory !== 'all'

  return (
    <div className="min-h-screen p-4 sm:p-8 md:p-12" style={{ background: C.bg, color: C.text }}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-6 mb-14">
          <div>
            <div className="flex items-center gap-4 mb-4">
              <div style={{ width: 32, height: 1, background: C.accent }} />
              {sectionLabel('Bibliotek')}
            </div>
            <h1 style={{
              fontFamily: 'var(--font-cormorant)',
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              fontWeight: 300,
              fontStyle: 'italic',
              color: C.text,
              lineHeight: 1,
            }}>
              Bilder
            </h1>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, marginTop: 8, letterSpacing: '0.06em' }}>
              {images.length} bilde{images.length !== 1 ? 'r' : ''} · gjenbrukes i prosjekter
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/images/presets">
              <Button variant="secondary" size="sm">Bilde-sett</Button>
            </Link>
            <Link href="/admin/images/new">
              <Button variant="primary" size="sm">+ Last opp bilde</Button>
            </Link>
          </div>
        </div>

        {/* Error banner */}
        {deleteError && (
          <div
            className="mb-6 px-5 py-3 flex items-center justify-between"
            style={{ background: 'rgba(184,64,64,0.12)', border: '1px solid rgba(184,64,64,0.3)', borderRadius: 3 }}
          >
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: '#E07070' }}>{deleteError}</p>
            <button onClick={() => setDeleteError(null)} style={{ color: C.text3, lineHeight: 0 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" d="M2 2l10 10M12 2L2 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Søk og filtrering */}
        <div className="mb-8 space-y-4">
          <Input
            type="text"
            placeholder="Søk på tittel, beskrivelse eller tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
          <div className="flex gap-2 flex-wrap">
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
        {!noResults ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map((image) => {
              const imageUrl = supabase.storage
                .from('assets')
                .getPublicUrl(image.file_path)

              return (
                <div
                  key={image.id}
                  style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 3, overflow: 'hidden' }}
                >
                  {/* Thumbnail */}
                  <div className="aspect-square" style={{ background: C.sidebar }}>
                    <img
                      src={imageUrl.data.publicUrl}
                      alt={image.title || image.filename}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, color: C.text, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {image.title || image.filename}
                    </p>

                    {/* Category */}
                    <div className="flex flex-wrap gap-1 mb-3">
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, background: C.sidebar, padding: '2px 6px', borderRadius: 2 }}>
                        {image.category}
                      </span>
                      {image.subcategory && (
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, background: C.sidebar, padding: '2px 6px', borderRadius: 2 }}>
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
                            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, letterSpacing: '0.04em' }}
                          >
                            {tag}
                          </span>
                        ))}
                        {image.tags.length > 3 && (
                          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3 }}>+{image.tags.length - 3}</span>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Link href={`/admin/images/${image.id}/edit`} className="flex-1">
                        <Button variant="primary" size="sm" className="w-full">
                          Rediger
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(image.id, image.title || image.filename)}
                        disabled={deletingId === image.id}
                        style={{ color: '#B84040' }}
                      >
                        {deletingId === image.id ? '...' : 'Slett'}
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div
            className="p-12 text-center"
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 3 }}
          >
            <p style={{ color: C.text3, fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', marginBottom: 8 }}>
              {isFiltered ? 'Ingen bilder funnet' : 'Ingen bilder ennå'}
            </p>
            {!isFiltered && (
              <>
                <p style={{ color: C.text3, fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', marginBottom: 20 }}>
                  Last opp bilder her for å gjenbruke dem i prosjektpresentasjoner.
                </p>
                <Link href="/admin/images/new">
                  <Button variant="primary">Last opp første bilde</Button>
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
