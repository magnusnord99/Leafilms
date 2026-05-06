'use client'

import { useState } from 'react'
import { Section, Image, SectionImage, CollagePreset } from '@/lib/types'
import { Button, Text } from '@/components/ui'
import { ImagePositionControls } from '@/components/project'
import { supabase } from '@/lib/supabase'

// Helper for å få full bilde-URL
const getImageUrl = (image: Image) => {
  return supabase.storage.from('assets').getPublicUrl(image.file_path).data.publicUrl
}

export type CollagePosition = 'pos1' | 'pos2' | 'pos3' | 'pos4' | 'pos5'

export type CollageImages = {
  pos1: Image | null
  pos2: Image | null
  pos3: Image | null
  pos4: Image | null
  pos5: Image | null
}

const POSITION_ORDER: CollagePosition[] = ['pos1', 'pos2', 'pos3', 'pos4', 'pos5']

type ExampleWorkSectionProps = {
  section: Section
  editMode: boolean
  collageImages: CollageImages
  selectedPreset: CollagePreset | null
  sectionImageData: Record<string, SectionImage[]>
  imagePosition: Record<string, { x: number; y: number; zoom: number | null }>
  setImagePosition: React.Dispatch<React.SetStateAction<Record<string, { x: number; y: number; zoom: number | null }>>>
  saveBackgroundPosition: (sectionId: string, imageIndex: number, positionX: number, positionY: number, zoom: number | null) => Promise<void>
  updateSectionContent: (sectionId: string, key: string, value: string | any) => void
  onImageClick: (position: CollagePosition) => void
  onOpenPresetPicker: () => void
}

export function ExampleWorkSection({
  section,
  editMode,
  collageImages,
  selectedPreset,
  sectionImageData,
  imagePosition,
  setImagePosition,
  saveBackgroundPosition,
  updateSectionContent,
  onImageClick,
  onOpenPresetPicker
}: ExampleWorkSectionProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const getCollageImageStyle = (imageIndex: number): React.CSSProperties => {
    const position = POSITION_ORDER[imageIndex]
    const image = collageImages[position]
    if (!image) return {}

    const imageUrl = getImageUrl(image)
    const key = `${section.id}_${imageIndex}`
    const sectionImage = sectionImageData[section.id]?.[imageIndex]

    const currentPos = imagePosition[key] || {
      x: sectionImage?.background_position_x ?? 50,
      y: sectionImage?.background_position_y ?? 50,
      zoom: sectionImage?.background_zoom ?? null
    }

    const backgroundSize =
      currentPos.zoom === null || currentPos.zoom === 1.0
        ? 'cover'
        : `${currentPos.zoom * 100}%`

    return {
      backgroundImage: `url(${imageUrl})`,
      backgroundSize,
      backgroundPosition: `${currentPos.x}% ${currentPos.y}%`,
      backgroundRepeat: 'no-repeat'
    }
  }

  const getCurrentPos = (imageIndex: number) => {
    const key = `${section.id}_${imageIndex}`
    const sectionImage = sectionImageData[section.id]?.[imageIndex]
    return imagePosition[key] || {
      x: sectionImage?.background_position_x ?? 50,
      y: sectionImage?.background_position_y ?? 50,
      zoom: sectionImage?.background_zoom ?? null
    }
  }

  // Rendrer en bildeplass – som vanlig funksjon, IKKE React-komponent,
  // slik at React ikke unmounter/remounter ved re-render av parent.
  const renderSlot = (position: CollagePosition, imageIndex: number, label: string, className = '') => {
    const image = collageImages[position]
    const isEditing = editingIndex === imageIndex
    const currentPos = getCurrentPos(imageIndex)
    const sectionImage = sectionImageData[section.id]?.[imageIndex]

    return (
      <div key={position} className={`overflow-hidden relative ${className}`}>
        {image ? (
          <>
            <div
              className="w-full h-full"
              style={getCollageImageStyle(imageIndex)}
            />
            {editMode && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setEditingIndex(isEditing ? null : imageIndex)
                }}
                className="absolute top-3 right-3 z-20 bg-[#201D18]/90 border border-[#38332A] text-[#E8E1D5] px-3 py-1.5 text-[0.6rem] tracking-widest uppercase rounded-[2px] hover:bg-[#2A261F] transition"
              >
                {isEditing ? 'Lukk' : 'Rediger'}
              </button>
            )}
            {editMode && isEditing && (
              <ImagePositionControls
                sectionId={section.id}
                sectionImage={sectionImage}
                currentPos={currentPos}
                onPositionChange={(newPos) => {
                  const key = `${section.id}_${imageIndex}`
                  setImagePosition((prev) => ({ ...prev, [key]: newPos }))
                  saveBackgroundPosition(section.id, imageIndex, newPos.x, newPos.y, newPos.zoom)
                }}
                onReset={() => {
                  const defaultPos = { x: 50, y: 50, zoom: null }
                  const key = `${section.id}_${imageIndex}`
                  setImagePosition((prev) => ({ ...prev, [key]: defaultPos }))
                  saveBackgroundPosition(section.id, imageIndex, defaultPos.x, defaultPos.y, defaultPos.zoom)
                }}
                onChangeImage={() => onImageClick(position)}
              />
            )}
          </>
        ) : (
          <div
            onClick={() => editMode && onImageClick(position)}
            className={`flex items-center justify-center h-full w-full transition-colors ${editMode ? 'cursor-pointer' : ''}`}
            style={{ background: editMode ? '#1A1713' : '#0C0B09' }}
          >
            {editMode && (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#38332A' }}>
                {label}
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="w-full">
      {/* Velg bilde-sett knapp i edit mode */}
      {editMode && (
        <div className="max-w-6xl mx-auto mb-6 px-4 flex items-center gap-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={onOpenPresetPicker}
          >
            📷 Velg bilde-sett
          </Button>
          {selectedPreset && (
            <Text variant="small" className="text-dark">
              Valgt: <span className="font-medium">{selectedPreset.name}</span>
            </Text>
          )}
        </div>
      )}

      {/* 5-bilde Grid Layout */}
      <div className="w-full bg-background-widget">
        {/* Mobile: Vertikal stabling */}
        <div className="flex flex-col md:hidden gap-0">
          <div className="h-[400px]">{renderSlot('pos1', 0, '1', 'h-full')}</div>
          <div className="h-[400px]">{renderSlot('pos2', 1, '2', 'h-full')}</div>
          <div className="h-[400px]">{renderSlot('pos3', 2, '3', 'h-full')}</div>
          <div className="h-[400px]">{renderSlot('pos4', 3, '4', 'h-full')}</div>
          <div className="h-[400px]">{renderSlot('pos5', 4, '5', 'h-full')}</div>
        </div>

        {/* Desktop: Ren grid uten overlapping */}
        <div className="hidden md:block">
          {/* Pos 1 - Full bredde topp */}
          <div className="h-[700px]">{renderSlot('pos1', 0, '1', 'h-full')}</div>

          {/* Midtseksjon: 2 kolonner */}
          <div className="grid grid-cols-2 gap-0">
            {/* Pos 2 - Venstre, strekker over 2 rader */}
            <div className="row-span-2 h-[800px]">{renderSlot('pos2', 1, '2', 'h-full')}</div>
            {/* Pos 3 - Øverst høyre */}
            <div className="h-[400px]">{renderSlot('pos3', 2, '3', 'h-full')}</div>
            {/* Pos 4 - Nederst høyre */}
            <div className="h-[400px]">{renderSlot('pos4', 3, '4', 'h-full')}</div>
          </div>

          {/* Pos 5 - Full bredde bunn */}
          <div className="h-[600px]">{renderSlot('pos5', 4, '5', 'h-full')}</div>
        </div>
      </div>
    </div>
  )
}
