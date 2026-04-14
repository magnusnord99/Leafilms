'use client'

import { useState, useEffect } from 'react'
import { Section, Image, SectionImage } from '@/lib/types'
import { Heading, Text } from '@/components/ui'
import { ImagePositionControls } from '@/components/project'

type GoalSectionProps = {
  section: Section
  editMode: boolean
  sectionImages: Record<string, Image[]>
  sectionImageData: Record<string, SectionImage[]>
  editingImageSectionId: string | null
  imagePosition: Record<string, { x: number; y: number; zoom: number | null }>
  goalSectionProgress: number
  goalSectionRef: React.RefObject<HTMLDivElement | null>
  getBackgroundStyle: (sectionId: string, imageIndex?: number) => React.CSSProperties
  getSectionTitle: (type: string) => string
  updateSectionContent: (sectionId: string, key: string, value: string | any) => void
  saveBackgroundPosition: (sectionId: string, imageIndex: number, positionX: number, positionY: number, zoom: number | null) => Promise<void>
  setImagePosition: React.Dispatch<React.SetStateAction<Record<string, { x: number; y: number; zoom: number | null }>>>
  onImageClick: () => void
  onEditPositionClick: (e: React.MouseEvent) => void
  onImagePickerOpen: () => void
}

export function GoalSection({
  section,
  editMode,
  sectionImages,
  sectionImageData,
  editingImageSectionId,
  imagePosition,
  goalSectionProgress,
  goalSectionRef,
  getBackgroundStyle,
  getSectionTitle,
  updateSectionContent,
  saveBackgroundPosition,
  setImagePosition,
  onImageClick,
  onEditPositionClick,
  onImagePickerOpen
}: GoalSectionProps) {
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

  const imageTransform = editMode || isMobile
    ? 'translateX(0)'
    : `translateX(${(1 - goalSectionProgress) * -60}%)`
  const imageOpacity = editMode || isMobile ? 1 : goalSectionProgress

  const textTransform = editMode || isMobile
    ? 'translateX(0)'
    : `translateX(${(1 - goalSectionProgress) * 60}%)`
  const textOpacity = editMode || isMobile ? 1 : goalSectionProgress

  return (
    <div ref={goalSectionRef} className="max-w-7xl mx-auto flex flex-col md:flex-row items-stretch overflow-hidden">
      {/* Image panel */}
      <div
        onClick={onImageClick}
        className={`w-full md:w-1/2 h-[50vh] md:h-auto min-h-[420px] relative overflow-hidden ${
          editMode && !sectionImages[section.id]?.[0] ? 'cursor-pointer' : ''
        }`}
        style={{
          background: '#161410',
          ...(sectionImages[section.id]?.[0] ? getBackgroundStyle(section.id, 0) : {}),
          transform: imageTransform,
          opacity: imageOpacity,
          transition: editMode || isMobile ? 'none' : 'transform 0.1s ease-out, opacity 0.1s ease-out',
        }}
      >
        {!sectionImages[section.id]?.[0] && editMode && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Text variant="muted">Klikk for å velge bilde</Text>
          </div>
        )}
        {editMode && sectionImages[section.id]?.[0] && (
          <button
            onClick={onEditPositionClick}
            className="absolute top-3 right-3 z-20 bg-[#201D18]/90 border border-[#38332A] text-[#E8E1D5] px-3 py-1.5 text-[0.6rem] tracking-widest uppercase rounded-[2px] hover:bg-[#2A261F] transition"
          >
            {editingImageSectionId === section.id ? 'Lukk' : 'Rediger'}
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
      </div>

      {/* Text panel */}
      <div
        className="w-full md:w-1/2 flex flex-col justify-center px-8 md:px-14 py-14 md:py-20"
        style={{
          background: '#161410',
          transform: textTransform,
          opacity: textOpacity,
          transition: editMode || isMobile ? 'none' : 'transform 0.1s ease-out, opacity 0.1s ease-out',
        }}
      >
        {/* Section label */}
        <div className="flex items-center gap-3 mb-6">
          <div style={{ width: 24, height: 1, background: '#C49434' }} />
          <span style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.6rem',
            letterSpacing: '0.16em',
            color: '#C49434',
            textTransform: 'uppercase',
            fontWeight: 500,
          }}>
            {getSectionTitle(section.type)}
          </span>
        </div>

        <Text
          variant="lead"
          className={`text-[#E8E1D5] whitespace-pre-wrap leading-relaxed ${
            editMode ? 'edit-outline min-h-[100px] px-3 py-2' : ''
          }`}
          contentEditable={editMode}
          suppressContentEditableWarning
          onBlur={(e) => {
            if (editMode) updateSectionContent(section.id, 'text', e.currentTarget.textContent || '')
          }}
        >
          {section.content.text || (editMode ? 'Klikk for å redigere...' : '')}
        </Text>
      </div>
    </div>
  )
}
