'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button, Card, Heading, Text, Input } from '@/components/ui'
import { Image } from '@/lib/types'
import { useImageCategories } from '@/hooks/useImageCategories'

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
  const [selectedSubcategory, setSelectedSubcategory] = useState('all')
  const [orientation, setOrientation] = useState<'all' | 'landscape' | 'portrait'>('all')
  const visibleImages = images.filter(image => {
    if (orientation === 'all') return true
    if (!image.width || !image.height) return false
    return orientation === 'landscape' ? image.width > image.height : image.height > image.width
  })
  const [selectedIds, setSelectedIds] = useState<string[]>(selectedImageIds)
  const [limitWarning, setLimitWarning] = useState(false)
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')

  const { categories: categoryList } = useImageCategories()
  const categories = [
    { value: 'all', label: 'Alle' },
    ...categoryList.map(cat => ({ value: cat.slug, label: cat.label })),
  ]

  // Last opp nytt bilde uten å forlate plukkeren — i stedet for det gamle
  // window.open('/admin/images/new')-unnslippshullet, som kun dukket opp når
  // biblioteket allerede var tomt og ikke valgte det nye bildet automatisk.
  const [mode, setMode] = useState<'browse' | 'upload'>('browse')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadCategory, setUploadCategory] = useState('')
  const [uploadSubcategory, setUploadSubcategory] = useState('')
  const [uploadTags, setUploadTags] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  useEffect(() => {
    if (!uploadCategory && categoryList.length > 0) setUploadCategory(categoryList[0].slug)
  }, [categoryList, uploadCategory])

  function startUpload() {
    setUploadError(null)
    setMode('upload')
  }

  function cancelUpload() {
    if (uploadPreview) URL.revokeObjectURL(uploadPreview)
    setUploadFile(null)
    setUploadPreview(null)
    setUploadTitle('')
    setUploadTags('')
    setUploadError(null)
    setMode('browse')
  }

  function handleUploadFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setUploadError('Filen er ikke et bilde')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Bildet er for stort (maks 10MB)')
      return
    }
    setUploadError(null)
    setUploadFile(file)
    setUploadPreview(URL.createObjectURL(file))
  }

  async function submitUpload() {
    if (!uploadFile) return
    setUploading(true)
    setUploadError(null)
    try {
      const ext = uploadFile.name.split('.').pop()
      const fileName = `${Math.random().toString(36).substring(2)}.${ext}`
      const filePath = `images/${fileName}`

      const { error: uploadErr } = await supabase.storage
        .from('assets')
        .upload(filePath, uploadFile, { cacheControl: '3600', upsert: false })
      if (uploadErr) throw uploadErr

      const dims = await new Promise<{ width: number; height: number }>((resolve) => {
        const img = new window.Image()
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
        img.onerror = () => resolve({ width: 0, height: 0 })
        img.src = uploadPreview || URL.createObjectURL(uploadFile)
      })

      const tagsArray = uploadTags.split(',').map(t => t.trim()).filter(t => t.length > 0)

      const { data: inserted, error: dbError } = await supabase
        .from('images')
        .insert({
          filename: uploadFile.name,
          file_path: filePath,
          title: uploadTitle || null,
          category: uploadCategory || null,
          subcategory: uploadSubcategory || null,
          tags: tagsArray,
          width: dims.width || null,
          height: dims.height || null,
          file_size: uploadFile.size,
        })
        .select('id, filename, file_path, title, category, subcategory, tags, width, height')
        .single()
      if (dbError || !inserted) throw dbError || new Error('Ingen rad returnert')

      setImages(prev => [inserted as Image, ...prev])
      toggleSelection(inserted.id)
      cancelUpload()
    } catch (err) {
      console.error('Error uploading image:', err)
      setUploadError('Kunne ikke laste opp bildet')
    } finally {
      setUploading(false)
    }
  }

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
      setMode('browse')
    }
  }, [isOpen, selectedImageIds])

  async function fetchImages() {
    try {
      setLoading(true)
      let query = supabase
        .from('images')
        .select('id, filename, file_path, title, category, subcategory, tags, width, height')
        .order('created_at', { ascending: false })

      if (selectedCategory !== 'all') {
        query = query.eq('category', selectedCategory)
      }

      if (selectedCategory !== 'all' && selectedSubcategory !== 'all') {
        query = query.eq('subcategory', selectedSubcategory)
      }

      if (debouncedSearchQuery.trim()) {
        query = query.or(`title.ilike.%${debouncedSearchQuery}%,description.ilike.%${debouncedSearchQuery}%`)
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

  // Debounce søket — uten dette gikk hver tastetrykk til et nytt uavgrenset
  // søk over alle bilder, se feedback 211b4ee1.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  useEffect(() => {
    if (isOpen) {
      fetchImages()
    }
  }, [isOpen, selectedCategory, selectedSubcategory, debouncedSearchQuery])

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
                {mode === 'upload' ? 'Last opp et nytt bilde til biblioteket' : 'Klikk for å velge/fjerne bilder'}
              </Text>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0" style={{ marginLeft: 16 }}>
              {mode === 'browse' && (
                <Button type="button" variant="secondary" size="sm" onClick={startUpload}>
                  + Last opp nytt bilde
                </Button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Lukk"
                style={{ color: '#62594E', lineHeight: 0 }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" d="M2 2l12 12M14 2L2 14" />
                </svg>
              </button>
            </div>
          </div>
          {limitWarning && (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: '#C49434', marginTop: 8 }}>
              Du kan maksimalt velge {maxSelection} bilde{maxSelection !== 1 ? 'r' : ''}.
            </p>
          )}
        </div>

        {mode === 'upload' ? (
          <div className="flex-1 overflow-y-auto min-h-0" data-lenis-prevent>
            <div className="max-w-md space-y-4">
              <input
                type="file"
                accept="image/*"
                onChange={handleUploadFileChange}
                className="hidden"
                id="image-picker-upload"
              />
              <label htmlFor="image-picker-upload" className="cursor-pointer block">
                <div className="border-2 border-dashed border-admin-border rounded-lg p-6 text-center hover:border-zinc-500 transition-colors">
                  {uploadPreview ? (
                    <img src={uploadPreview} alt="" className="max-h-48 mx-auto rounded object-contain" />
                  ) : (
                    <Text variant="body">Klikk for å velge et bilde</Text>
                  )}
                </div>
              </label>

              <Input
                label="Tittel (valgfritt)"
                type="text"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
              />

              <div>
                <Text variant="body" className="mb-2 block">Kategori</Text>
                <select
                  value={uploadCategory}
                  onChange={(e) => { setUploadCategory(e.target.value); setUploadSubcategory('') }}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-4 py-2 text-white"
                >
                  {categoryList.map((cat) => (
                    <option key={cat.slug} value={cat.slug}>{cat.label}</option>
                  ))}
                </select>
              </div>

              {categoryList.find(cat => cat.slug === uploadCategory)?.subcategories.length ? (
                <label className="block text-white">
                  Underkategori
                  <select
                    value={uploadSubcategory}
                    onChange={event => setUploadSubcategory(event.target.value)}
                    className="mt-2 w-full rounded border border-zinc-700 bg-zinc-900 px-4 py-2 text-white"
                  >
                    <option value="">Ingen underkategori</option>
                    {categoryList.find(cat => cat.slug === uploadCategory)?.subcategories.map(sub => (
                      <option key={sub.id} value={`${uploadCategory}/${sub.slug}`}>{sub.label}</option>
                    ))}
                  </select>
                </label>
              ) : null}

              <Input
                label="Tags (komma-separert, valgfritt)"
                type="text"
                value={uploadTags}
                onChange={(e) => setUploadTags(e.target.value)}
              />

              {uploadError && (
                <p style={{ fontSize: '0.75rem', color: '#E05A4A' }}>{uploadError}</p>
              )}

              <div className="flex gap-3">
                <Button type="button" variant="secondary" onClick={cancelUpload} disabled={uploading}>
                  Avbryt
                </Button>
                <Button type="button" variant="primary" onClick={submitUpload} disabled={uploading || !uploadFile}>
                  {uploading ? 'Laster opp...' : 'Last opp og velg'}
                </Button>
              </div>
            </div>
          </div>
        ) : (
        <>
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
                onClick={() => { setSelectedCategory(cat.value); setSelectedSubcategory('all') }}
              >
                {cat.label}
              </Button>
            ))}
          </div>
          {categoryList.find(cat => cat.slug === selectedCategory)?.subcategories.length ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Underkategorier">
              <Button size="sm" variant={selectedSubcategory === 'all' ? 'primary' : 'secondary'} onClick={() => setSelectedSubcategory('all')}>Alle underkategorier</Button>
              {categoryList.find(cat => cat.slug === selectedCategory)?.subcategories.map(sub => {
                const value = `${selectedCategory}/${sub.slug}`
                return (
                  <Button key={sub.id} size="sm" variant={selectedSubcategory === value ? 'primary' : 'secondary'} onClick={() => setSelectedSubcategory(value)}>{sub.label}</Button>
                )
              })}
            </div>
          ) : null}
        </div>

        <div className="mb-4 flex flex-shrink-0 flex-wrap items-center gap-2" role="group" aria-label="Bildeformat">
          <span className="mr-1 text-sm text-zinc-400">Format:</span>
          {([
            { value: 'all', label: 'Alle' },
            { value: 'landscape', label: 'Liggende' },
            { value: 'portrait', label: 'Stående' },
          ] as const).map(option => (
            <Button key={option.value} size="sm" variant={orientation === option.value ? 'primary' : 'secondary'} aria-pressed={orientation === option.value} onClick={() => setOrientation(option.value)}>
              {option.label}
            </Button>
          ))}
        </div>

        {/* Images Grid */}
        <div className="flex-1 overflow-y-auto min-h-0" data-lenis-prevent>
          {loading ? (
            <div className="text-center py-12">
              <Text variant="body">Laster bilder...</Text>
            </div>
          ) : visibleImages.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
              {visibleImages.map((image) => {
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
                        loading="lazy"
                        decoding="async"
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
              <Button type="button" variant="primary" onClick={startUpload}>
                Last opp nytt bilde
              </Button>
            </div>
          )}
        </div>
        </>
        )}

        {mode === 'browse' && (
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
        )}
      </Card>
    </div>
  )
}

