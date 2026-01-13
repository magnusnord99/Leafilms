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
  updateSectionContent: (sectionId: string, key: string, value: string | any) => void
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

  // Hent video URL hvis video finnes
  const videoUrl = hasVideo 
    ? supabase.storage.from('assets').getPublicUrl(sectionVideos[section.id][0].file_path).data.publicUrl
    : null

  // State for fade-in animasjon
  const [isVisible, setIsVisible] = useState(false)
  
  // State for scroll-basert størrelse
  const [scrollScale, setScrollScale] = useState(1)
  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    // Trigger fade-in når komponenten mountes
    const timer = setTimeout(() => {
      setIsVisible(true)
    }, 200)
    return () => clearTimeout(timer)
  }, [])

  // Scroll-effekt for å gjøre teksten mindre når man scroller
  useEffect(() => {
    if (!headerRef.current) return

    const handleScroll = () => {
      const header = headerRef.current
      if (!header) return

      const rect = header.getBoundingClientRect()
      const windowHeight = window.innerHeight
      
      // Beregn scale basert på hvor mye header har blitt scrollet forbi
      // Når rect.top er negativ, har vi scrollet forbi toppen
      if (rect.top < 0 && rect.bottom > 0) {
        // Header er delvis scrollet forbi
        const scrolledPast = Math.abs(rect.top)
        const headerHeight = rect.height
        // Scale fra 1 til 0.5 basert på hvor mye vi har scrollet
        const scrollProgress = Math.min(1, scrolledPast / headerHeight)
        const scale = Math.max(0.5, 1 - (scrollProgress * 0.5))
        setScrollScale(scale)
      } else if (rect.top >= 0) {
        // Header er helt synlig, full størrelse
        setScrollScale(1)
      } else {
        // Header er helt scrollet forbi, minimum størrelse
        setScrollScale(0.5)
      }
    }

    // Initial call
    handleScroll()
    
    // Throttle scroll events for bedre ytelse
    let ticking = false
    const throttledHandleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          handleScroll()
          ticking = false
        })
        ticking = true
      }
    }

    window.addEventListener('scroll', throttledHandleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', throttledHandleScroll)
    }
  }, [])

  // Handler for å åpne video picker (prioriteres alltid)
  const handleBackgroundClick = () => {
    if (editMode) {
      if (onVideoPickerOpen) {
        onVideoPickerOpen()
      } else if (onImageClick) {
        onImageClick()
      }
    }
  }

  return (
    <header 
      ref={headerRef}
      onClick={hasVideo ? undefined : (editMode ? handleBackgroundClick : undefined)}
      className={`relative min-h-screen flex items-center justify-center px-2 md:px-4 py-20 bg-background overflow-hidden ${
        editMode && !hasVideo ? 'cursor-pointer hover:bg-background/90 transition-colors' : ''
      }`}
      style={{}}
    >
      {/* Bakgrunnsvideo - prioriteres over bilde */}
      {hasVideo && videoUrl && sectionVideo && (
        <video
          autoPlay={sectionVideo.autoplay}
          loop={sectionVideo.loop}
          muted={sectionVideo.muted}
          playsInline
          className="absolute inset-0 w-full h-full object-cover z-0"
          style={{
            objectFit: 'cover',
            objectPosition: 'center'
          }}
        >
          <source src={videoUrl} type="video/mp4" />
        </video>
      )}
      
      {/* Bilde som fallback hvis ingen video */}
      {!hasVideo && hasImage && (
        <div 
          className="absolute inset-0 w-full h-full z-0 pointer-events-none"
          style={getBackgroundStyle(section.id, 0)}
        />
      )}

      {/* Overlay for bedre lesbarhet */}
      {(hasVideo || hasImage) && (
        <div className="absolute inset-0 bg-black/30 z-[1]" />
      )}

      {/* Redigeringsknapper */}
      {editMode && (hasImage || hasVideo) && (
        <div className="absolute top-4 right-4 z-20 flex gap-2">
          {hasVideo && onVideoPickerOpen && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onVideoPickerOpen()
              }}
              className="bg-white/90 hover:bg-white text-dark px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 transition"
              title="Bytt video"
            >
              🎬 Bytt video
            </button>
          )}
          {hasImage && !hasVideo && onVideoPickerOpen && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onVideoPickerOpen()
              }}
              className="bg-white/90 hover:bg-white text-dark px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 transition"
              title="Bytt til video"
            >
              🎬 Bytt til video
            </button>
          )}
          {hasImage && !hasVideo && (
            <button
              onClick={onEditPositionClick}
              className="bg-white/90 hover:bg-white text-dark px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 transition"
              title="Rediger bilde-posisjon"
            >
              {editingImageSectionId === section.id ? '✕ Lukk' : '✏️ Rediger posisjon'}
            </button>
          )}
          {hasImage && !hasVideo && onImagePickerOpen && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onImagePickerOpen()
              }}
              className="bg-white/90 hover:bg-white text-dark px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 transition"
              title="Bytt bilde"
            >
              🖼️ Bytt bilde
            </button>
          )}
        </div>
      )}

      {/* Legg til video/bilde knapp i edit mode */}
      {editMode && !hasVideo && !hasImage && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            // Prioriter video over bilde
            if (onVideoPickerOpen) {
              onVideoPickerOpen()
            } else {
              onImageClick()
            }
          }}
          className="absolute inset-0 flex items-center justify-center bg-background/50 hover:bg-background/70 transition-colors z-10"
        >
          <div className="text-center">
            <Text variant="body" className="text-dark mb-2">Klikk for å legge til bakgrunnsvideo</Text>
            <Text variant="small" className="text-dark/70">Video (eller bilde som alternativ)</Text>
          </div>
        </button>
      )}
      
      {/* Zoom/Pan kontroller for Hero (kun for bilder) */}
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

      <div 
        className="max-w-7xl mx-auto text-center relative z-[2]"
        style={{
          opacity: isVisible ? 1 : 0,
          transform: isVisible 
            ? `translateY(0) scale(${scrollScale})` 
            : `translateY(20px) scale(${scrollScale})`,
          transformOrigin: 'center center',
          transition: isVisible ? 'opacity 2s ease-out, transform 0.1s ease-out' : 'opacity 2s ease-out, transform 0.1s ease-out',
        }}
      >
        <Heading
          as="h1"
          size="lg"
          className={`mb-6 text-white ${editMode ? 'cursor-text hover:outline hover:outline-2 hover:outline-white/50 hover:outline-dashed rounded px-2 py-1' : ''}`}
          contentEditable={editMode}
          suppressContentEditableWarning
          onBlur={(e) => {
            if (editMode) {
              updateSectionContent(section.id, 'client', e.currentTarget.textContent || '')
            }
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {section.content.client || project.client_name || project.title}
        </Heading>
        <Heading
          as="h2"
          size="sm"
          className="max-w-3xl mx-auto text-white"
          contentEditable={editMode}
          suppressContentEditableWarning
          onBlur={(e) => {
            if (editMode) {
              updateSectionContent(section.id, 'description', e.currentTarget.textContent || '')
            }
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {section.content.description || 'Innholdsproduksjon'}
        </Heading>
      </div>
    </header>
  )
}

