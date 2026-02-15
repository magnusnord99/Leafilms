'use client'

import { Section, Image, SectionImage } from '@/lib/types'
import { ImagePositionControls } from '@/components/project'

type FullImageSectionProps = {
  section: Section
  editMode: boolean
  sectionImages: Record<string, Image[]>
  sectionImageData: Record<string, SectionImage[]>
  editingImageSectionId: string | null
  imagePosition: Record<string, { x: number; y: number; zoom: number | null }>
  getBackgroundStyle: (sectionId: string, imageIndex?: number) => React.CSSProperties
  saveBackgroundPosition: (sectionId: string, imageIndex: number, positionX: number, positionY: number, zoom: number | null) => Promise<void>
  setImagePosition: React.Dispatch<React.SetStateAction<Record<string, { x: number; y: number; zoom: number | null }>>>
  onImageClick: () => void
  onEditPositionClick: (e: React.MouseEvent) => void
  onImagePickerOpen: () => void
}

export function FullImageSection({
  section,
  editMode,
  sectionImages,
  sectionImageData,
  editingImageSectionId,
  imagePosition,
  getBackgroundStyle,
  saveBackgroundPosition,
  setImagePosition,
  onImageClick,
  onEditPositionClick,
  onImagePickerOpen
}: FullImageSectionProps) {
  const sectionImage = sectionImageData[section.id]?.[0]
  const currentPos = imagePosition[section.id] || {
    x: sectionImage?.background_position_x ?? 50,
    y: sectionImage?.background_position_y ?? 50,
    zoom: sectionImage?.background_zoom ?? null
  }

  const backgroundStyle = sectionImages[section.id]?.[0]
    ? getBackgroundStyle(section.id, 0)
    : {}

  return (
    <div className="w-full">
      <div
        onClick={onImageClick}
        className={`relative w-full min-h-[50vh] overflow-hidden ${
          editMode && !sectionImages[section.id]?.[0]
            ? 'cursor-pointer bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center'
            : ''
        }`}
        style={sectionImages[section.id]?.[0] ? backgroundStyle : undefined}
      >
        {editMode && !sectionImages[section.id]?.[0] && (
          <span className="text-zinc-500 text-lg">Klikk for å velge bilde</span>
        )}

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
      </div>
    </div>
  )
}
