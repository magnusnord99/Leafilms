'use client'

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

  const categories = [
    { value: 'all', label: 'Alle' },
    { value: 'hero', label: 'Hero' },
    { value: 'background', label: 'Bakgrunn' },
    { value: 'showcase', label: 'Showcase' },
    { value: 'nature', label: 'Natur' },
    { value: 'urban', label: 'Urban' },
    { value: 'sport', label: 'Sport' }
  ]

  useEffect(() => {
    if (isOpen) {
      fetchVideos()
      setSelectedIds(selectedVideoIds)
    }
  }, [isOpen, selectedVideoIds])

  async function fetchVideos() {
    try {
      setLoading(true)
      let query = supabase
        .from('video_library')
        .select('*')
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
    fetchVideos()
  }, [selectedCategory, searchQuery])

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
      alert(`Du kan maksimalt velge ${maxSelection} videoer`)
      return
    }

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <Card className="w-full max-w-6xl max-h-[90vh] flex flex-col bg-zinc-900 border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-700">
          <Heading as="h2" size="lg" className="text-white">Velg video</Heading>
          <Button variant="ghost" onClick={onClose} size="sm">
            ✕
          </Button>
        </div>

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
              <Text variant="small" className="text-gray-400">
                {searchQuery ? 'Prøv et annet søkeord' : 'Last opp videoer i videobiblioteket'}
              </Text>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-zinc-700">
          <Text variant="small" className="text-gray-400">
            {selectedIds.length > 0 
              ? `${selectedIds.length} video${selectedIds.length > 1 ? 'er' : ''} valgt`
              : 'Ingen videoer valgt'}
          </Text>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose}>
              Avbryt
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              disabled={selectedIds.length === 0}
            >
              Velg ({selectedIds.length})
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
