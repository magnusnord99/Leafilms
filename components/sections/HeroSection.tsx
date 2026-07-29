'use client'

import { Section, Image, SectionImage, Project, VideoLibrary, SectionVideo } from '@/lib/types'
import { Heading, Text } from '@/components/ui'
import { ImagePositionControls } from '@/components/project'
import { supabase } from '@/lib/supabase'
import { useEffect, useState, useRef } from 'react'

type HeroSectionProps = {
  section: Section
  project: Project
  editMode: boolean
  sectionImages: Record<string, Image[]>
  sectionImageData: Record<string, SectionImage[]>
  sectionVideos?: Record<string, VideoLibrary[]>
  sectionVideoData?: Record<string, SectionVideo[]>
  editingImageSectionId: string | null
  imagePosition: Record<string, { x: number; y: number; zoom: number | null }>
  getBackgroundStyle: (sectionId: string, imageIndex?: number) => React.CSSProperties
  updateSectionContent: (sectionId: string, key: string, value: unknown) => void
  saveBackgroundPosition: (sectionId: string, imageIndex: number, positionX: number, positionY: number, zoom: number | null) => Promise<void>
  setImagePosition: React.Dispatch<React.SetStateAction<Record<string, { x: number; y: number; zoom: number | null }>>>
  onImageClick: () => void
  onEditPositionClick: (e: React.MouseEvent) => void
  onImagePickerOpen: () => void
  onVideoPickerOpen?: () => void
}

export function HeroSection({
  section,
  project,
  editMode,
  sectionImages,
  sectionImageData,
  sectionVideos = {},
  sectionVideoData = {},
  editingImageSectionId,
  imagePosition,
  getBackgroundStyle,
  updateSectionContent,
  saveBackgroundPosition,
  setImagePosition,
  onImageClick,
  onEditPositionClick,
  onImagePickerOpen,
  onVideoPickerOpen
}: HeroSectionProps) {
  const sectionImage = sectionImageData[section.id]?.[0]
  const sectionVideo = sectionVideoData[section.id]?.[0]
  const hasVideo = sectionVideos[section.id]?.[0] && sectionVideo
  const hasImage = sectionImages[section.id]?.[0] && sectionImage

  const currentPos = imagePosition[section.id] || {
    x: sectionImage?.background_position_x ?? 50,
    y: sectionImage?.background_position_y ?? 50,
    zoom: sectionImage?.background_zoom ?? null
  }

  const videoUrl = hasVideo
    ? supabase.storage.from('assets').getPublicUrl(sectionVideos[section.id][0].file_path).data.publicUrl
    : null

  const [isVisible, setIsVisible] = useState(false)
  const [scrollProgress, setScrollProgress] = useState(0)
  const headerRef = useRef<HTMLElement>(null)
  const videoContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = videoContainerRef.current
    if (!container || !videoUrl) return

    container.innerHTML = ''

    const video = document.createElement('video')
    video.setAttribute('autoplay', '')
    video.setAttribute('loop', '')
    video.setAttribute('muted', '')
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')
    video.muted = true
    video.autoplay = true
    video.loop = true
    video.className = 'absolute inset-0 w-full h-full object-cover z-0'
    video.style.pointerEvents = 'none'

    const source = document.createElement('source')
    source.src = videoUrl
    source.type = 'video/mp4'
    video.appendChild(source)
    container.appendChild(video)

    video.play().catch(() => {})

    const tryPlay = () => video.play().catch(() => {})
    document.addEventListener('touchstart', tryPlay, { once: true })

    return () => {
      document.removeEventListener('touchstart', tryPlay)
      container.innerHTML = ''
    }
  }, [videoUrl])

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!headerRef.current) return
    const handleScroll = () => {
      const header = headerRef.current
      if (!header) return
      const rect = header.getBoundingClientRect()
      if (rect.bottom <= 0) { setScrollProgress(1); return }
      if (rect.top >= 0) { setScrollProgress(0); return }
      setScrollProgress(Math.min(1, Math.abs(rect.top) / rect.height))
    }
    let ticking = false
    const throttled = () => {
      if (!ticking) {
        requestAnimationFrame(() => { handleScroll(); ticking = false })
        ticking = true
      }
    }
    window.addEventListener('scroll', throttled, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', throttled)
  }, [])

  const handleBackgroundClick = () => {
    if (editMode) {
      if (onVideoPickerOpen) onVideoPickerOpen()
      else onImageClick()
    }
  }

  const textScale = Math.max(0.72, 1 - scrollProgress * 0.28)
  const textOpacity = Math.max(0, 1 - scrollProgress * 1.6)

  return (
    <header
      ref={headerRef}
      onClick={hasVideo ? undefined : (editMode ? handleBackgroundClick : undefined)}
      className={`relative min-h-dvh flex items-end justify-start overflow-hidden ${
        editMode && !hasVideo ? 'cursor-pointer' : ''
      }`}
      style={{ background: '#0C0B09' }}
    >
      {/* Background video — imperativt opprettet for å garantere muted-attributt på iOS */}
      {hasVideo && videoUrl && sectionVideo && (
        <div ref={videoContainerRef} className="absolute inset-0 w-full h-full z-0" />
      )}

      {/* Background image */}
      {!hasVideo && hasImage && (
        <div
          className="absolute inset-0 w-full h-full z-0 pointer-events-none"
          style={getBackgroundStyle(section.id, 0)}
        />
      )}

      {/* Cinematic gradient overlay — heavier at bottom for text legibility */}
      {(hasVideo || hasImage) && (
        <>
          <div className="absolute inset-0 z-[1]" style={{
            background: 'linear-gradient(to top, rgba(12,11,9,0.96) 0%, rgba(12,11,9,0.5) 40%, rgba(12,11,9,0.15) 70%, rgba(12,11,9,0.1) 100%)'
          }} />
          <div className="absolute inset-0 z-[1]" style={{
            background: 'linear-gradient(to right, rgba(12,11,9,0.3) 0%, transparent 60%)'
          }} />
        </>
      )}

      {/* Empty state in edit mode */}
      {!hasVideo && !hasImage && editMode && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (onVideoPickerOpen) onVideoPickerOpen()
            else onImageClick()
          }}
          className="absolute inset-0 flex items-center justify-center z-10"
          style={{ background: 'rgba(255,255,255,0.03)' }}
        >
          <div className="text-center border border-dashed border-[#38332A] px-10 py-8 rounded-[2px]">
            <Text variant="muted">Klikk for å legge til bakgrunnsvideo</Text>
            <Text variant="xs" className="mt-1" style={{ color: '#62594E' }}>Video (eller bilde som alternativ)</Text>
          </div>
        </button>
      )}

      {/* Edit controls */}
      {editMode && (hasImage || hasVideo) && (
        <div className="absolute top-5 right-5 z-20 flex gap-2">
          {hasVideo && onVideoPickerOpen && (
            <button
              onClick={(e) => { e.stopPropagation(); onVideoPickerOpen() }}
              className="bg-[#201D18]/90 border border-[#38332A] text-[#E8E1D5] px-3 py-1.5 text-[0.6rem] tracking-widest uppercase rounded-[2px] hover:bg-[#2A261F] transition"
            >
              Bytt video
            </button>
          )}
          {hasImage && !hasVideo && onVideoPickerOpen && (
            <button
              onClick={(e) => { e.stopPropagation(); onVideoPickerOpen() }}
              className="bg-[#201D18]/90 border border-[#38332A] text-[#E8E1D5] px-3 py-1.5 text-[0.6rem] tracking-widest uppercase rounded-[2px] hover:bg-[#2A261F] transition"
            >
              Bytt til video
            </button>
          )}
          {hasImage && !hasVideo && (
            <button
              onClick={onEditPositionClick}
              className="bg-[#201D18]/90 border border-[#38332A] text-[#E8E1D5] px-3 py-1.5 text-[0.6rem] tracking-widest uppercase rounded-[2px] hover:bg-[#2A261F] transition"
            >
              {editingImageSectionId === section.id ? 'Lukk' : 'Rediger posisjon'}
            </button>
          )}
          {hasImage && !hasVideo && onImagePickerOpen && (
            <button
              onClick={(e) => { e.stopPropagation(); onImagePickerOpen() }}
              className="bg-[#201D18]/90 border border-[#38332A] text-[#E8E1D5] px-3 py-1.5 text-[0.6rem] tracking-widest uppercase rounded-[2px] hover:bg-[#2A261F] transition"
            >
              Bytt bilde
            </button>
          )}
        </div>
      )}

      {/* Image position controls */}
      {editMode && editingImageSectionId === section.id && hasImage && !hasVideo && (
        <ImagePositionControls
          sectionId={section.id}
          sectionImage={sectionImage}
          currentPos={currentPos}
          onPositionChange={(newPos) => {
            setImagePosition(prev => ({ ...prev, [section.id]: newPos }))
            saveBackgroundPosition(section.id, 0, newPos.x, newPos.y, newPos.zoom)
          }}
          onReset={() => {
            const defaultPos = { x: 50, y: 50, zoom: null }
            setImagePosition(prev => ({ ...prev, [section.id]: defaultPos }))
            saveBackgroundPosition(section.id, 0, defaultPos.x, defaultPos.y, defaultPos.zoom)
          }}
          onChangeImage={onImagePickerOpen}
        />
      )}

      {/* Hero text — anchored bottom-left, editorial */}
      <div
        className="relative z-[2] w-full px-8 md:px-16 pb-16 md:pb-20"
        style={{
          opacity: isVisible ? textOpacity : 0,
          transform: isVisible
            ? `translateY(0) scale(${textScale})`
            : `translateY(32px) scale(${textScale})`,
          transformOrigin: 'bottom left',
          transition: isVisible
            ? 'opacity 0.15s ease-out, transform 0.15s ease-out'
            : 'opacity 1.2s cubic-bezier(0.16,1,0.3,1), transform 1.2s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {/* Label line */}
        <div className="mb-4 flex items-center gap-4">
          <div className="w-8 h-px bg-[#C49434]" />
          <span style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.78rem',
            letterSpacing: '0.18em',
            color: '#C49434',
            textTransform: 'uppercase',
            fontWeight: 500,
          }}>
            Leafilms
          </span>
        </div>

        {/* Main title */}
        <Heading
          as="h3"
          size="xl"
          className={`mb-4 text-[#E8E1D5] ${editMode ? 'cursor-text' : ''}`}
          style={{
            fontFamily: 'var(--font-cormorant), Georgia, serif',
            fontWeight: 300,
            fontStyle: 'italic',
            lineHeight: 0.9,
            maxWidth: '20ch',
            fontSize: 'clamp(3.5rem, 8vw, 5rem)',
          }}
          contentEditable={editMode}
          suppressContentEditableWarning
          onBlur={(e) => {
            if (editMode) updateSectionContent(section.id, 'client', e.currentTarget.textContent || '')
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {section.content.client || project.client_name || project.title}
        </Heading>

        {/* Subtitle */}
        <p
          className={`${editMode ? 'cursor-text' : ''}`}
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.975rem',
            letterSpacing: '0.14em',
            color: '#9E9287',
            textTransform: 'uppercase',
            fontWeight: 400,
            maxWidth: '40ch',
          }}
          contentEditable={editMode}
          suppressContentEditableWarning
          onBlur={(e) => {
            if (editMode) updateSectionContent(section.id, 'description', e.currentTarget.textContent || '')
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {section.content.description || 'Innholdsproduksjon'}
        </p>
      </div>

      {/* Scroll indicator */}
      {!editMode && (
        <div
          className="absolute bottom-8 right-10 z-[2] flex flex-col items-center gap-2"
          style={{ opacity: Math.max(0, 1 - scrollProgress * 3) }}
        >
          {/* Animated vertical line */}
          <div style={{
            width: 1,
            height: 48,
            background: 'linear-gradient(to bottom, transparent, #C49434)',
            animation: 'scroll-line-in 1.4s cubic-bezier(0.16,1,0.3,1) 2s forwards',
            opacity: 0,
          }} />
          {/* Dot at bottom */}
          <div style={{
            width: 3,
            height: 3,
            borderRadius: '50%',
            background: '#C49434',
            animation: 'fade-in 0.5s ease-out 3.2s forwards',
            opacity: 0,
          }} />
        </div>
      )}
    </header>
  )
}
