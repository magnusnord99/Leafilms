'use client'

import { useState, useEffect } from 'react'
import { Section, Image, SectionImage } from '@/lib/types'
import { Text } from '@/components/ui'
import { DeliverableGrid } from '@/components/project'
import { ImagePositionControls } from '@/components/project'

type DeliverablesSectionProps = {
  section: Section
  editMode: boolean
  sectionImages: Record<string, Image[]>
  sectionImageData: Record<string, SectionImage[]>
  editingImageSectionId: string | null
  imagePosition: Record<string, { x: number; y: number; zoom: number | null }>
  getBackgroundStyle: (sectionId: string, imageIndex?: number, options?: { forMobile?: boolean }) => React.CSSProperties
  getSectionTitle: (type: string) => string
  updateSectionContent: (sectionId: string, key: string, value: string | any) => void
  saveBackgroundPosition: (sectionId: string, imageIndex: number, positionX: number, positionY: number, zoom: number | null) => Promise<void>
  setImagePosition: React.Dispatch<React.SetStateAction<Record<string, { x: number; y: number; zoom: number | null }>>>
  onImageClick: () => void
  onEditPositionClick: (e: React.MouseEvent) => void
  onImagePickerOpen: () => void
}

export function DeliverablesSection({
  section,
  editMode,
  sectionImages,
  sectionImageData,
  editingImageSectionId,
  imagePosition,
  getBackgroundStyle,
  getSectionTitle,
  updateSectionContent,
  saveBackgroundPosition,
  setImagePosition,
  onImageClick,
  onEditPositionClick,
  onImagePickerOpen
}: DeliverablesSectionProps) {
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

  return (
    <div className="w-full">
      <div
        onClick={onImageClick}
        className={`relative min-h-[85vh] flex flex-col justify-end overflow-hidden ${
          editMode && !sectionImages[section.id]?.[0] ? 'cursor-pointer' : ''
        }`}
        style={{
          background: '#0C0B09',
          ...(sectionImages[section.id]?.[0]
            ? getBackgroundStyle(section.id, 0, { forMobile: isMobile })
            : {}),
        }}
      >
        {/* Cinematic overlay */}
        {sectionImages[section.id]?.[0] && (
          <div className="absolute inset-0 z-[1]" style={{
            background: 'linear-gradient(to top, rgba(12,11,9,0.97) 0%, rgba(12,11,9,0.6) 35%, rgba(12,11,9,0.2) 65%, transparent 100%)'
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

        {/* Content panel */}
        <div
          className="relative z-[2] px-8 md:px-16 py-12 md:py-16 w-full"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Label */}
          <div className="flex items-center gap-4 mb-8">
            <div style={{ width: 28, height: 1, background: '#C49434' }} />
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

          {/* Description */}
          <Text
            variant="lead"
            className={`max-w-lg text-[#E8E1D5] whitespace-pre-wrap mb-10 ${
              editMode ? 'edit-outline px-3 py-2' : ''
            }`}
            contentEditable={editMode}
            suppressContentEditableWarning
            onBlur={(e) => {
              if (editMode) updateSectionContent(section.id, 'text', e.currentTarget.textContent || '')
            }}
            onClick={(e) => e.stopPropagation()}
            style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
          >
            {section.content.text || 'Vi leverer et bredt spekter av innhold tilpasset ulike plattformer.'}
          </Text>

          {/* Deliverables grid */}
          <div onClick={(e) => e.stopPropagation()} className="min-h-[120px]">
            <DeliverableGrid
              items={section.content.deliverableItems}
              editMode={editMode}
              onItemsChange={(newItems) => {
                updateSectionContent(section.id, 'deliverableItems', newItems)
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
