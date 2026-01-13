'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button, Card, Heading, Text, Input } from '@/components/ui'
import { VideoLibrary } from '@/lib/types'

export default function VideosPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [videos, setVideos] = useState<VideoLibrary[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // Kategorier for videoer
  const categories = [
    { value: 'all', label: 'Alle kategorier' },
    { value: 'hero', label: 'Hero' },
    { value: 'background', label: 'Bakgrunn' },
    { value: 'showcase', label: 'Showcase' },
    { value: 'nature', label: 'Natur' },
    { value: 'urban', label: 'Urban' },
    { value: 'sport', label: 'Sport' }
  ]

  useEffect(() => {
    fetchVideos()
  }, [])

  async function fetchVideos() {
    try {
      let query = supabase
        .from('video_library')
        .select('*')
        .order('created_at', { ascending: false })

      // Filtrer på kategori
      if (selectedCategory !== 'all') {
        query = query.eq('category', selectedCategory)
      }

      // Søk i title, description og tags
      if (searchQuery.trim()) {
        query = query.or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%,tags.cs.{${searchQuery}}`)
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

  async function handleDelete(videoId: string, videoTitle: string) {
    if (!confirm(`Er du sikker på at du vil slette "${videoTitle || 'denne videoen'}"?\n\nDette kan ikke angres.`)) {
      return
    }

    try {
      // Hent videoinfo for å slette fra storage
      const { data: videoData } = await supabase
        .from('video_library')
        .select('file_path, thumbnail_path')
        .eq('id', videoId)
        .single()

      // Slett fra database
      const { error: dbError } = await supabase
        .from('video_library')
        .delete()
        .eq('id', videoId)

      if (dbError) throw dbError

      // Slett fra storage hvis file_path finnes
      if (videoData?.file_path) {
        const pathParts = videoData.file_path.split('/')
        const fileName = pathParts[pathParts.length - 1]
        const storagePath = `videos/${fileName}`
        
        await supabase.storage
          .from('assets')
          .remove([storagePath])
      }

      // Slett thumbnail hvis den finnes
      if (videoData?.thumbnail_path) {
        const thumbPathParts = videoData.thumbnail_path.split('/')
        const thumbFileName = thumbPathParts[thumbPathParts.length - 1]
        const thumbStoragePath = `videos/thumbnails/${thumbFileName}`
        
        await supabase.storage
          .from('assets')
          .remove([thumbStoragePath])
      }

      // Video slettet
      fetchVideos()
    } catch (error) {
      console.error('Error deleting video:', error)
      alert('❌ Kunne ikke slette video')
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
            variant="secondary"
            onClick={() => router.push('/admin')}
            className="mb-4 -ml-2"
          >
            ← Tilbake til admin
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <Heading as="h1" size="lg" className="mb-2 text-white">Videobibliotek</Heading>
              <Text variant="muted" className="text-white">Administrer videoer for gjenbruk i prosjekter</Text>
            </div>
            <Link href="/admin/videos/new">
              <Button variant="primary">+ Last opp video</Button>
            </Link>
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
                onClick={() => setSelectedCategory(cat.value)}
              >
                {cat.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Videos Grid */}
        {videos && videos.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {videos.map((video) => {
              const videoUrl = supabase.storage
                .from('assets')
                .getPublicUrl(video.file_path)
              
              const thumbnailUrl = video.thumbnail_path
                ? supabase.storage
                    .from('assets')
                    .getPublicUrl(video.thumbnail_path)
                : null

              return (
                <Card key={video.id} className="overflow-hidden p-0">
                  {/* Thumbnail/Video Preview */}
                  <div className="aspect-video bg-zinc-800 flex items-center justify-center relative">
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
                    <div className="absolute top-2 right-2 bg-black/70 px-2 py-1 rounded text-xs">
                      {video.duration ? `${Math.floor(video.duration / 60)}:${String(video.duration % 60).padStart(2, '0')}` : '—'}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <Heading as="h3" size="sm" className="mb-2 line-clamp-1">
                      {video.title || video.filename}
                    </Heading>
                    
                    {/* Category badges */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className="text-xs px-2 py-1 bg-zinc-800 rounded text-gray-400">
                        {video.category}
                      </span>
                      {video.subcategory && (
                        <span className="text-xs px-2 py-1 bg-zinc-800 rounded text-gray-400">
                          {video.subcategory}
                        </span>
                      )}
                    </div>

                    {/* Tags */}
                    {video.tags && video.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {video.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="text-xs px-2 py-1 bg-zinc-900 rounded text-gray-500"
                          >
                            {tag}
                          </span>
                        ))}
                        {video.tags.length > 3 && (
                          <span className="text-xs text-gray-500">+{video.tags.length - 3}</span>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(video.id, video.title || video.filename)}
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
            <Text variant="body" className="mb-4">Ingen videoer ennå</Text>
            <Link href="/admin/videos/new">
              <Button variant="primary">Last opp første video</Button>
            </Link>
          </Card>
        )}
      </div>
    </div>
  )
}
