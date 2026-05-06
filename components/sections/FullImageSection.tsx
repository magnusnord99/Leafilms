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
        className={`relative w-full overflow-hidden ${
          editMode && !sectionImages[section.id]?.[0]
            ? 'cursor-pointer flex items-center justify-center'
            : ''
        }`}
        style={{
          minHeight: editMode ? '40vh' : '65vh',
          background: '#0C0B09',
          ...(sectionImages[section.id]?.[0] ? backgroundStyle : {}),
        }}
      >
        {/* Subtle vignette overlay for cinematic look */}
        {sectionImages[section.id]?.[0] && (
          <div
            className="absolute inset-0 z-[1] pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, transparent 40%, rgba(12,11,9,0.45) 100%)',
            }}
          />
        )}

        {editMode && !sectionImages[section.id]?.[0] && (
          <div className="border border-dashed border-[#38332A] px-10 py-8 rounded-[2px] text-center">
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#62594E' }}>
              Klikk for å velge bilde
            </p>
          </div>
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
      </div>
    </div>
  )
}
