'use client'

import { useState, useEffect } from 'react'
import { Section, Image, SectionImage } from '@/lib/types'
import { Heading, Text } from '@/components/ui'
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
  updateSectionContent: (sectionId: string, key: string, value: string | any) => void
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

  // Sjekk om vi er på mobil (mindre enn 768px = Tailwind's md breakpoint)
  const [isMobile, setIsMobile] = useState(false)
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    // Sjekk ved mount
    checkMobile()
    
    // Sjekk ved resize
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Beregn zoom basert på scroll progress
  // START_ZOOM: Hvor stort hele seksjonen er når animasjonen starter (1.0 = 100%, 1.2 = 120%, osv.)
  // ZOOM_AMOUNT: Hvor mye hele seksjonen zoomer inn når man scroller (0.2 = 20% zoom, 0.5 = 50% zoom, osv.)
  const START_ZOOM = 0.8 // Endre denne verdien for å justere startstørrelsen (1.0 = 100%, 1.5 = 150%, osv.)
  const ZOOM_AMOUNT = 0.1 // Endre denne verdien for å justere hvor mye seksjonen zoomer inn
  
  // Beregn zoom - alltid bruk START_ZOOM som base (ignorer background_zoom fra DB for scroll-animasjon)
  // På mobil: ingen zoom (scale(1.0)), på desktop: bruk scroll zoom
  const baseZoom = START_ZOOM
  const scrollZoom = editMode 
    ? 1.0 // Ingen zoom i edit mode
    : isMobile 
      ? 1.0 // Ingen zoom på mobil
      : baseZoom + (conceptSectionProgress * ZOOM_AMOUNT) // Legg til zoom basert på scroll (kun desktop)
  
  // Hent base background style (uten å overstyre backgroundSize)
  const backgroundStyle = sectionImages[section.id]?.[0] 
    ? getBackgroundStyle(section.id, 0)
    : {}

  return (
    <div ref={conceptSectionRef} className="w-full">
      <div className="max-w-7xl mx-auto mt-0 mb-8 mx-6">
        <div 
          onClick={onImageClick}
          className={`bg-gray-800 p-12 min-h-[800px] flex flex-col items-center justify-center w-full relative overflow-hidden ${
            editMode && !sectionImages[section.id]?.[0] ? 'cursor-pointer hover:bg-gray-700 transition-colors' : ''
          }`}
          style={{
            ...backgroundStyle,
            transform: editMode 
              ? undefined 
              : `scale(${scrollZoom})`,
            transformOrigin: 'center center',
            transition: editMode ? 'none' : 'transform 0.1s ease-out'
          }}
        >
          {editMode && sectionImages[section.id]?.[0] && (
            <button
              onClick={onEditPositionClick}
              className="absolute top-4 right-4 z-20 bg-white/90 hover:bg-white text-dark px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 transition"
              title="Rediger bilde-posisjon"
            >
              {editingImageSectionId === section.id ? '✕ Lukk' : '✏️ Rediger posisjon'}
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
          
          <div className="m-8 w-full max-w-2xl">
            <div className="bg-background-widget p-8 inline-block shadow-xl">
              <Heading 
                as="h3" 
                className="mb-4 break-words"
                onClick={(e) => e.stopPropagation()}
              >
                {getSectionTitle(section.type)}
              </Heading>
              <Text 
                variant="lead"
                className={`whitespace-pre-wrap break-words overflow-wrap-anywhere ${editMode ? 'cursor-text hover:outline hover:outline-2 hover:outline-black/50 hover:outline-dashed rounded px-4 py-2' : ''}`}
                contentEditable={editMode}
                suppressContentEditableWarning
                onBlur={(e) => {
                  if (editMode) {
                    updateSectionContent(section.id, 'text', e.currentTarget.textContent || '')
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
              >
                {section.content.text || (editMode ? 'Klikk for å redigere...' : 'Ingen tekst lagt til ennå...')}
              </Text>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

