'use client'

import { MediaDownloadLink } from '@/components/shared/MediaDownloadLink'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button, Card, Heading, Text, Input } from '@/components/ui'
import { VideoLibrary } from '@/lib/types'

interface VideoPickerModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (videoIds: string[]) => void
  selectedVideoIds?: string[]
  maxSelection?: number
  category?: string
}

export function VideoPickerModal({
  isOpen,
  onClose,
  onSelect,
  selectedVideoIds = [],
  maxSelection = 1,
  category
}: VideoPickerModalProps) {
  const [videos, setVideos] = useState<VideoLibrary[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>(category || 'all')
  const [selectedIds, setSelectedIds] = useState<string[]>(selectedVideoIds)
  const [limitWarning, setLimitWarning] = useState(false)

  const categories = [
    { value: 'all', label: 'Alle' },
    { value: 'hero', label: 'Hero' },
    { value: 'background', label: 'Bakgrunn' },
    { value: 'showcase', label: 'Showcase' },
    { value: 'nature', label: 'Natur' },
    { value: 'urban', label: 'Urban' },
    { value: 'sport', label: 'Sport' }
  ]
  const uploadCategories = categories.filter(c => c.value !== 'all')

  // Last opp ny video uten å forlate plukkeren — samme begrunnelse som
  // ImagePickerModal: biblioteket skal kunne fylles direkte fra "Velg
  // video"-knappen, ikke kreve en tur til en egen /admin/videos/new-side.
  const [mode, setMode] = useState<'browse' | 'upload'>('browse')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadCategory, setUploadCategory] = useState(category && category !== 'all' ? category : 'hero')
  const [uploadTags, setUploadTags] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

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
    if (!file.type.startsWith('video/')) {
      setUploadError('Filen er ikke en video')
      return
    }
    const maxSize = 50 * 1024 * 1024
    if (file.size > maxSize) {
      setUploadError(`Videoen er for stor (${(file.size / (1024 * 1024)).toFixed(1)}MB, maks 50MB)`)
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
      const filePath = `videos/${fileName}`

      const { error: uploadErr } = await supabase.storage
        .from('assets')
        .upload(filePath, uploadFile, { cacheControl: '3600', upsert: false, contentType: uploadFile.type || 'video/mp4' })
      if (uploadErr) throw uploadErr

      let videoWidth: number | null = null
      let videoHeight: number | null = null
      let duration: number | null = null
      try {
        const videoEl = document.createElement('video')
        videoEl.src = uploadPreview || URL.createObjectURL(uploadFile)
        await new Promise((resolve, reject) => {
          videoEl.onloadedmetadata = () => {
            videoWidth = videoEl.videoWidth
            videoHeight = videoEl.videoHeight
            duration = Math.floor(videoEl.duration)
            resolve(null)
          }
          videoEl.onerror = reject
        })
      } catch (err) {
        console.warn('Could not extract video metadata:', err)
      }

      const tagsArray = uploadTags.split(',').map(t => t.trim()).filter(t => t.length > 0)

      const { data: inserted, error: dbError } = await supabase
        .from('video_library')
        .insert({
          filename: uploadFile.name,
          file_path: filePath,
          title: uploadTitle || null,
          category: uploadCategory,
          tags: tagsArray,
          duration,
          width: videoWidth,
          height: videoHeight,
          file_size: uploadFile.size,
        })
        .select('id, filename, file_path, title, category, thumbnail_path, duration')
        .single()
      if (dbError || !inserted) throw dbError || new Error('Ingen rad returnert')

      setVideos(prev => [inserted as VideoLibrary, ...prev])
      toggleSelection(inserted.id)
      cancelUpload()
    } catch (err) {
      console.error('Error uploading video:', err)
      setUploadError('Kunne ikke laste opp videoen')
    } finally {
      setUploading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      setSelectedIds(selectedVideoIds)
      setMode('browse')
    }
  }, [isOpen, selectedVideoIds])

  async function fetchVideos() {
    try {
      setLoading(true)
      let query = supabase
        .from('video_library')
        .select('id, filename, file_path, title, category, thumbnail_path, duration')
        .order('created_at', { ascending: false })

      if (selectedCategory !== 'all') {
        query = query.eq('category', selectedCategory)
      }

      if (searchQuery.trim()) {
        query = query.or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
      }

      const { data, error } = await query

      if (error) throw error
      setVideos((data || []) as VideoLibrary[])
    } catch (error) {
      console.error('Error fetching videos:', error)
      alert('Kunne ikke hente videoer')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchVideos()
    }
  }, [isOpen, selectedCategory, searchQuery])

  function toggleSelection(videoId: string) {
    // Hvis maxSelection er 1, erstatt alltid den gamle videoen med den nye
    if (maxSelection === 1) {
      setSelectedIds(prev => 
        prev.includes(videoId) 
          ? [] // Deselect hvis man klikker på samme video
          : [videoId] // Erstatt med ny video
      )
      return
    }

    // For flere videoer, bruk normal toggle-logikk
    if (maxSelection && selectedIds.length >= maxSelection && !selectedIds.includes(videoId)) {
      setLimitWarning(true)
      setTimeout(() => setLimitWarning(false), 2500)
      return
    }
    setLimitWarning(false)

    setSelectedIds(prev => 
      prev.includes(videoId)
        ? prev.filter(id => id !== videoId)
        : [...prev, videoId]
    )
  }

  function handleConfirm() {
    onSelect(selectedIds)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4">
      <Card className="w-full max-w-6xl max-h-[95vh] sm:max-h-[90vh] flex flex-col bg-zinc-900 border-zinc-700">
        {/* Header */}
        <div className="p-6 border-b border-zinc-700">
          <div className="flex items-center justify-between">
            <Heading as="h2" size="lg" className="text-white">
              {mode === 'upload' ? 'Last opp ny video' : 'Velg video'}
            </Heading>
            <div className="flex items-center gap-3">
              {mode === 'browse' && (
                <Button type="button" variant="secondary" size="sm" onClick={startUpload}>
                  + Last opp ny video
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
              Du kan maksimalt velge {maxSelection} video{maxSelection !== 1 ? 'er' : ''}.
            </p>
          )}
        </div>

        {mode === 'upload' ? (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-md space-y-4">
              <input
                type="file"
                accept="video/*"
                onChange={handleUploadFileChange}
                className="hidden"
                id="video-picker-upload"
              />
              <label htmlFor="video-picker-upload" className="cursor-pointer block">
                <div className="border-2 border-dashed border-zinc-700 rounded-lg p-6 text-center hover:border-zinc-600 transition-colors">
                  {uploadPreview ? (
                    <video src={uploadPreview} className="max-h-48 mx-auto rounded" controls />
                  ) : (
                    <Text variant="body" className="text-white">Klikk for å velge en video (maks 50MB)</Text>
                  )}
                </div>
              </label>

              <Input
                label="Tittel (valgfritt)"
                type="text"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-white"
              />

              <div>
                <Text variant="body" className="mb-2 block text-white">Kategori</Text>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-4 py-2 text-white"
                >
                  {uploadCategories.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>

              <Input
                label="Tags (komma-separert, valgfritt)"
                type="text"
                value={uploadTags}
                onChange={(e) => setUploadTags(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-white"
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
        {/* Search and Filters */}
        <div className="p-6 border-b border-zinc-700 space-y-4">
          <Input
            type="text"
            placeholder="Søk på tittel eller beskrivelse..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-zinc-800 border-zinc-700 text-white"
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

        {/* Video Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-12">
              <Text variant="body" className="text-white">Laster videoer...</Text>
            </div>
          ) : videos.length === 0 ? (
            <div className="text-center py-12">
              <Text variant="body" className="text-white mb-4">Ingen videoer funnet</Text>
              <Button type="button" variant="primary" onClick={startUpload}>
                Last opp ny video
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {videos.map((video) => {
                const videoUrl = supabase.storage
                  .from('assets')
                  .getPublicUrl(video.file_path)
                
                const thumbnailUrl = video.thumbnail_path
                  ? supabase.storage
                      .from('assets')
                      .getPublicUrl(video.thumbnail_path)
                  : null

                const isSelected = selectedIds.includes(video.id)

                return (
                  <div
                    key={video.id}
                    onClick={() => toggleSelection(video.id)}
                    className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                      isSelected
                        ? 'border-blue-500 ring-2 ring-blue-500/50'
                        : 'border-zinc-700 hover:border-zinc-600'
                    }`}
                  >
                    {/* Video Preview */}
                    <div className="aspect-video bg-zinc-800 relative">
                      {thumbnailUrl ? (
                        <img
                          src={thumbnailUrl.data.publicUrl}
                          alt={video.title || video.filename}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <video
                          src={videoUrl.data.publicUrl}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                          onMouseEnter={(e) => {
                            const videoEl = e.currentTarget
                            videoEl.currentTime = 0
                            videoEl.play().catch(() => {})
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.pause()
                          }}
                        />
                      )}
                      {isSelected && (
                        <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                          <div className="bg-blue-500 rounded-full w-12 h-12 flex items-center justify-center">
                            <span className="text-white text-xl">✓</span>
                          </div>
                        </div>
                      )}
                      {video.duration && (
                        <div className="absolute bottom-2 right-2 bg-black/70 px-2 py-1 rounded text-xs text-white">
                          {Math.floor(video.duration / 60)}:{String(video.duration % 60).padStart(2, '0')}
                        </div>
                      )}
                    </div>
                    <div className="bg-zinc-800 px-2 pt-2 text-zinc-200">
                      <MediaDownloadLink filePath={video.file_path} filename={video.filename} />
                    </div>
                    {/* Title */}
                    <div className="p-2 bg-zinc-800">
                      <Text variant="small" className="text-white line-clamp-1">
                        {video.title || video.filename}
                      </Text>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        </>
        )}

        {mode === 'browse' && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6 border-t border-zinc-700">
            <Text variant="small" className="text-gray-400">
              {selectedIds.length > 0
                ? `${selectedIds.length} video${selectedIds.length > 1 ? 'er' : ''} valgt`
                : 'Ingen videoer valgt'}
            </Text>
            <div className="flex gap-2 flex-shrink-0">
              <Button variant="secondary" size="sm" onClick={onClose}>
                Avbryt
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirm}
                disabled={selectedIds.length === 0}
              >
                Velg ({selectedIds.length})
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
