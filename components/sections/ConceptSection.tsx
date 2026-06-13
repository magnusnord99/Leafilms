'use client'

import { useState, useEffect } from 'react'
import { Section, Image, SectionImage } from '@/lib/types'
import { Text } from '@/components/ui'
import { ImagePositionControls } from '@/components/project'

type ConceptSectionProps = {
  section: Section
  editMode: boolean
  sectionImages: Record<string, Image[]>
  sectionImageData: Record<string, SectionImage[]>
  editingImageSectionId: string | null
  imagePosition: Record<string, { x: number; y: number; zoom: number | null }>
  conceptSectionProgress: number
  conceptSectionRef: React.RefObject<HTMLDivElement | null>
  getBackgroundStyle: (sectionId: string, imageIndex?: number) => React.CSSProperties
  getSectionTitle: (type: string) => string
  updateSectionContent: (sectionId: string, key: string, value: unknown) => void
  saveBackgroundPosition: (sectionId: string, imageIndex: number, positionX: number, positionY: number, zoom: number | null) => Promise<void>
  setImagePosition: React.Dispatch<React.SetStateAction<Record<string, { x: number; y: number; zoom: number | null }>>>
  onImageClick: () => void
  onEditPositionClick: (e: React.MouseEvent) => void
  onImagePickerOpen: () => void
}

export function ConceptSection({
  section,
  editMode,
  sectionImages,
  sectionImageData,
  editingImageSectionId,
  imagePosition,
  conceptSectionProgress,
  conceptSectionRef,
  getBackgroundStyle,
  getSectionTitle,
  updateSectionContent,
  saveBackgroundPosition,
  setImagePosition,
  onImageClick,
  onEditPositionClick,
  onImagePickerOpen
}: ConceptSectionProps) {
  const sectionImage = sectionImageData[section.id]?.[0]
  const currentPos = imagePosition[section.id] || {
    x: sectionImage?.background_position_x ?? 50,
    y: sectionImage?.background_position_y ?? 50,
    zoom: sectionImage?.background_zoom ?? null
  }

  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const START_ZOOM = 0.92
  const ZOOM_AMOUNT = 0.08

  const scrollZoom = editMode
    ? 1.0
    : isMobile
    ? 1.0
    : START_ZOOM + conceptSectionProgress * ZOOM_AMOUNT

  const backgroundStyle = sectionImages[section.id]?.[0]
    ? getBackgroundStyle(section.id, 0)
    : {}

  const textPanel = (extraClass = '') => (
    <div
      className={`${extraClass}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-3 mb-5">
        <div style={{ width: 24, height: 1, background: '#C49434' }} />
        <span
          className={editMode ? 'edit-outline px-2 py-1 cursor-text' : ''}
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.78rem',
            letterSpacing: '0.16em',
            color: '#C49434',
            textTransform: 'uppercase',
            fontWeight: 500,
          }}
          contentEditable={editMode}
          suppressContentEditableWarning
          onBlur={(e) => {
            if (editMode) updateSectionContent(section.id, 'sectionLabel', e.currentTarget.textContent || '')
          }}
        >
          {section.content.sectionLabel || getSectionTitle(section.type)}
        </span>
      </div>

      <p
        className={editMode ? 'edit-outline min-h-[80px] px-3 py-2' : ''}
        contentEditable={editMode}
        suppressContentEditableWarning
        onBlur={(e) => {
          if (editMode) updateSectionContent(section.id, 'text', e.currentTarget.textContent || '')
        }}
        onClick={(e) => e.stopPropagation()}
        style={{
          fontFamily: 'var(--font-cormorant), Georgia, serif',
          fontSize: 'clamp(1.25rem, 2.2vw, 1.75rem)',
          fontWeight: 300,
          fontStyle: 'italic',
          lineHeight: 1.55,
          color: '#E8E1D5',
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
          whiteSpace: 'pre-wrap',
        }}
      >
        {section.content.text || (editMode ? 'Klikk for å redigere...' : '')}
      </p>
    </div>
  )

  return (
    <div ref={conceptSectionRef} className="w-full">
      <div className="mx-4 md:mx-8 my-0 md:my-4 overflow-hidden rounded-[2px]">
        <div
          onClick={onImageClick}
          className={`relative h-[60vh] md:min-h-[80vh] flex flex-col items-start md:justify-end overflow-hidden ${
            editMode && !sectionImages[section.id]?.[0] ? 'cursor-pointer' : ''
          }`}
          style={{
            background: '#161410',
            ...backgroundStyle,
            transform: editMode ? undefined : `scale(${scrollZoom})`,
            transformOrigin: 'center center',
            transition: editMode ? 'none' : 'transform 0.1s ease-out',
          }}
        >
          {/* Cinematic overlay — desktop only */}
          {sectionImages[section.id]?.[0] && (
            <div className="hidden md:block absolute inset-0 z-[1]" style={{
              background: 'linear-gradient(to top, rgba(12,11,9,0.92) 0%, rgba(12,11,9,0.4) 40%, transparent 70%)'
            }} />
          )}

          {editMode && sectionImages[section.id]?.[0] && (
            <button
              onClick={onEditPositionClick}
              className="absolute top-4 right-4 z-20 bg-[#201D18]/90 border border-[#38332A] text-[#E8E1D5] px-3 py-1.5 text-[0.6rem] tracking-widest uppercase rounded-[2px] hover:bg-[#2A261F] transition"
            >
              {editingImageSectionId === section.id ? 'Lukk' : 'Rediger posisjon'}
            </button>
          )}

          {editMode && editingImageSectionId === section.id && sectionImages[section.id]?.[0] && (
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

          {/* Empty state */}
          {!sectionImages[section.id]?.[0] && editMode && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="border border-dashed border-[#38332A] px-10 py-8 rounded-[2px] text-center">
                <Text variant="muted">Klikk for å velge bilde</Text>
              </div>
            </div>
          )}

          {/* Text panel — desktop only, overlaid bottom left */}
          {textPanel('hidden md:block relative z-[2] px-14 pb-16 pt-8 w-full max-w-2xl')}
        </div>

        {/* Text panel — mobile only, below image */}
        {textPanel('block md:hidden px-8 py-10')}
      </div>
    </div>
  )
}
