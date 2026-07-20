'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button, Card, Heading, Text, Input } from '@/components/ui'
import { Image } from '@/lib/types'

interface ImagePickerModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (imageIds: string[]) => void
  selectedImageIds?: string[]
  maxSelection?: number
  category?: string
}

export function ImagePickerModal({
  isOpen,
  onClose,
  onSelect,
  selectedImageIds = [],
  maxSelection,
  category
}: ImagePickerModalProps) {
  const [images, setImages] = useState<Image[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>(category || 'all')
  const [selectedIds, setSelectedIds] = useState<string[]>(selectedImageIds)
  const [limitWarning, setLimitWarning] = useState(false)

  const categories = [
    { value: 'all', label: 'Alle' },
    { value: 'landskap', label: 'Landskap' },
    { value: 'sport', label: 'Sport' },
    { value: 'closeup', label: 'Close-up' },
    { value: 'portrett', label: 'Portrett' },
    { value: 'event', label: 'Event' },
    { value: 'kommersiell', label: 'Kommersiell' },
    { value: 'abstrakt', label: 'Abstrakt' },
    { value: 'bts', label: 'Behind The Scenes' },
    { value: 'bryllup', label: 'Bryllup' }
  ]

  // Rediger navn/tags direkte her — uten dette må man forlate pitchen og inn i det separate
  // bildebiblioteket for å f.eks. legge til en manglende tag (feedback 3bba01ce).
  const [editingImageId, setEditingImageId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editTags, setEditTags] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  function startEditing(e: React.MouseEvent, image: Image) {
    e.stopPropagation()
    setEditingImageId(image.id)
    setEditTitle(image.title || '')
    setEditTags(image.tags?.join(', ') || '')
  }

  async function saveEdit(e: React.MouseEvent, imageId: string) {
    e.stopPropagation()
    setSavingEdit(true)
    try {
      const tagsArray = editTags.split(',').map(t => t.trim()).filter(t => t.length > 0)
      const { error } = await supabase
        .from('images')
        .update({ title: editTitle || null, tags: tagsArray })
        .eq('id', imageId)
      if (error) throw error
      setImages(prev => prev.map(img => img.id === imageId ? { ...img, title: editTitle || null, tags: tagsArray } : img))
      setEditingImageId(null)
    } catch (error) {
      console.error('Error saving image edit:', error)
      alert('Kunne ikke lagre endringer')
    } finally {
      setSavingEdit(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      setSelectedIds(selectedImageIds)
    }
  }, [isOpen, selectedImageIds])

  async function fetchImages() {
    try {
      setLoading(true)
      let query = supabase
        .from('images')
        .select('id, filename, file_path, title, category, subcategory, tags')
        .order('created_at', { ascending: false })

      if (selectedCategory !== 'all') {
        query = query.eq('category', selectedCategory)
      }

      if (searchQuery.trim()) {
        query = query.or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
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
    if (isOpen) {
      fetchImages()
    }
  }, [isOpen, selectedCategory, searchQuery])

  function toggleSelection(imageId: string) {
    // Hvis maxSelection er 1, erstatt alltid det gamle bildet med det nye
    if (maxSelection === 1) {
      setSelectedIds(prev => 
        prev.includes(imageId) 
          ? [] // Deselect hvis man klikker på samme bilde
          : [imageId] // Erstatt med nytt bilde
      )
      return
    }

    // For flere bilder, bruk normal toggle-logikk
    if (maxSelection && selectedIds.length >= maxSelection && !selectedIds.includes(imageId)) {
      setLimitWarning(true)
      setTimeout(() => setLimitWarning(false), 2500)
      return
    }
    setLimitWarning(false)

    setSelectedIds(prev => 
      prev.includes(imageId)
        ? prev.filter(id => id !== imageId)
        : [...prev, imageId]
    )
  }

  function handleConfirm() {
    onSelect(selectedIds)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-admin-bg/80 flex items-center justify-center p-2 sm:p-6 md:p-8 z-50">
      <Card className="max-w-6xl w-full max-h-[90vh] sm:max-h-[80vh] flex flex-col overflow-hidden">
        <div className="mb-6 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <Heading as="h2" size="md" className="mb-2">
                Velg bilder
                {maxSelection && ` (maks ${maxSelection})`}
              </Heading>
              <Text variant="muted">
                Klikk for å velge/fjerne bilder
              </Text>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Lukk"
              style={{ color: '#62594E', lineHeight: 0, flexShrink: 0, marginLeft: 16 }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" d="M2 2l12 12M14 2L2 14" />
              </svg>
            </button>
          </div>
          {limitWarning && (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: '#C49434', marginTop: 8 }}>
              Du kan maksimalt velge {maxSelection} bilde{maxSelection !== 1 ? 'r' : ''}.
            </p>
          )}
        </div>

        {/* Søk og filtrering */}
        <div className="mb-6 space-y-4 flex-shrink-0">
          <Input
            type="text"
            placeholder="Søk på tittel eller beskrivelse..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <div className="flex gap-2 flex-wrap">
            {categories.map((cat) => (
              <Button
                key={cat.value}
                variant={selectedCategory === cat.value ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setSelectedCategory(cat.value)}
              >
                {cat.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Images Grid */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="text-center py-12">
              <Text variant="body">Laster bilder...</Text>
            </div>
          ) : images.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
              {images.map((image) => {
                const isSelected = selectedIds.includes(image.id)
                const imageUrl = supabase.storage
                  .from('assets')
                  .getPublicUrl(image.file_path)

                return (
                  <div
                    key={image.id}
                    onClick={() => toggleSelection(image.id)}
                    className={`cursor-pointer rounded-lg overflow-hidden transition ${
                      isSelected
                        ? 'ring-2 ring-green-500'
                        : 'hover:ring-2 hover:ring-zinc-600'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-square bg-admin-surface-light flex items-center justify-center relative">
                      <img
                        src={imageUrl.data.publicUrl}
                        alt={image.title || image.filename}
                        className="w-full h-full object-cover"
                      />
                      {isSelected && (
                        <div className="absolute top-2 right-2 bg-success text-admin-text text-xs px-2 py-1 rounded">
                          ✓ Valgt
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={(e) => startEditing(e, image)}
                        title="Rediger navn/tags"
                        className="absolute top-2 left-2 bg-black/60 text-white text-xs w-6 h-6 rounded flex items-center justify-center hover:bg-black/80"
                      >
                        ✎
                      </button>
                    </div>

                    {/* Info / inline redigering */}
                    {editingImageId === image.id ? (
                      <div
                        className="bg-admin-surface p-2 space-y-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          placeholder="Navn"
                          className="w-full bg-admin-surface-light border border-admin-border rounded px-2 py-1 text-xs text-white"
                        />
                        <input
                          type="text"
                          value={editTags}
                          onChange={(e) => setEditTags(e.target.value)}
                          placeholder="Tags, komma-separert"
                          className="w-full bg-admin-surface-light border border-admin-border rounded px-2 py-1 text-xs text-white"
                        />
                        <div className="flex gap-1">
                          <button
                            type="button"
                            disabled={savingEdit}
                            onClick={(e) => saveEdit(e, image.id)}
                            className="flex-1 bg-success text-xs rounded py-1 disabled:opacity-50"
                          >
                            {savingEdit ? '...' : 'Lagre'}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setEditingImageId(null) }}
                            className="flex-1 bg-admin-surface-light text-xs rounded py-1"
                          >
                            Avbryt
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-admin-surface p-2">
                        <Text variant="small" className="line-clamp-1 text-xs">
                          {image.title || image.filename}
                        </Text>
                        {image.category && (
                          <Text variant="muted" className="text-xs">
                            {image.category}
                          </Text>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <Text variant="body" className="mb-4">
                Ingen bilder funnet
              </Text>
              <Button
                type="button"
                variant="primary"
                onClick={() => window.open('/admin/images/new', '_blank')}
              >
                Last opp bilde
              </Button>
            </div>
          )}
        </div>

        <div className="flex gap-4 pt-6 border-t border-admin-border flex-shrink-0">
          <Button
            type="button"
            onClick={onClose}
            variant="secondary"
            className="flex-1"
          >
            Avbryt
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            variant="primary"
            className="flex-1"
          >
            Bekreft ({selectedIds.length} valgt)
          </Button>
        </div>
      </Card>
    </div>
  )
}

