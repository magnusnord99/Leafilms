'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button, Input } from '@/components/ui'
import { VideoLibrary } from '@/lib/types'
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

export default function VideosPage() {
  const [loading, setLoading] = useState(true)
  const [videos, setVideos] = useState<VideoLibrary[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

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
    setDeletingId(videoId)
    setDeleteError(null)
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

      fetchVideos()
    } catch (error) {
      console.error('Error deleting video:', error)
      setDeleteError('Kunne ikke slette video. Prøv igjen.')
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
              Videoer
            </h1>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, marginTop: 8, letterSpacing: '0.06em' }}>
              {videos.length} video{videos.length !== 1 ? 'er' : ''} · gjenbrukes i prosjekter
            </p>
          </div>
          <Link href="/admin/videos/new">
            <Button variant="primary" size="sm">+ Last opp video</Button>
          </Link>
        </div>

        {/* Error */}
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
                onClick={() => setSelectedCategory(cat.value)}
              >
                {cat.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Videos Grid */}
        {videos.length > 0 ? (
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

              return (
                <div
                  key={video.id}
                  style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 3, overflow: 'hidden' }}
                >
                  {/* Thumbnail/Video Preview */}
                  <div className="aspect-video flex items-center justify-center relative" style={{ background: C.sidebar }}>
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
                    {video.duration && (
                      <div
                        className="absolute bottom-2 right-2 px-2 py-1 rounded"
                        style={{ background: 'rgba(0,0,0,0.75)', fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text, letterSpacing: '0.04em' }}
                      >
                        {Math.floor(video.duration / 60)}:{String(video.duration % 60).padStart(2, '0')}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, color: C.text, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {video.title || video.filename}
                    </p>

                    {/* Category */}
                    <div className="flex flex-wrap gap-1 mb-3">
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, background: C.sidebar, padding: '2px 6px', borderRadius: 2 }}>
                        {video.category}
                      </span>
                      {video.subcategory && (
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, background: C.sidebar, padding: '2px 6px', borderRadius: 2 }}>
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
                            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.border, letterSpacing: '0.04em' }}
                          >
                            {tag}
                          </span>
                        ))}
                        {video.tags.length > 3 && (
                          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.border }}>+{video.tags.length - 3}</span>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(video.id, video.title || video.filename)}
                        disabled={deletingId === video.id}
                        style={{ color: '#B84040' }}
                        className="flex-1"
                      >
                        {deletingId === video.id ? 'Sletter...' : 'Slett'}
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
              {searchQuery || selectedCategory !== 'all' ? 'Ingen videoer funnet' : 'Ingen videoer ennå'}
            </p>
            {!searchQuery && selectedCategory === 'all' && (
              <>
                <p style={{ color: C.border, fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', marginBottom: 20 }}>
                  Last opp videoer her for å gjenbruke dem i prosjektpresentasjoner.
                </p>
                <Link href="/admin/videos/new">
                  <Button variant="primary">Last opp første video</Button>
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
