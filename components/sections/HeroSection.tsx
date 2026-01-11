'use client'

import { Section, Image, SectionImage, Project } from '@/lib/types'
import { Heading, Text } from '@/components/ui'
import { ImagePositionControls } from '@/components/project'

type HeroSectionProps = {
  section: Section
  project: Project
  editMode: boolean
  sectionImages: Record<string, Image[]>
  sectionImageData: Record<string, SectionImage[]>
  editingImageSectionId: string | null
  imagePosition: Record<string, { x: number; y: number; zoom: number | null }>
  getBackgroundStyle: (sectionId: string, imageIndex?: number) => React.CSSProperties
  updateSectionContent: (sectionId: string, key: string, value: string | any) => void
  saveBackgroundPosition: (sectionId: string, imageIndex: number, positionX: number, positionY: number, zoom: number | null) => Promise<void>
  setImagePosition: React.Dispatch<React.SetStateAction<Record<string, { x: number; y: number; zoom: number | null }>>>
  onImageClick: () => void
  onEditPositionClick: (e: React.MouseEvent) => void
  onImagePickerOpen: () => void
}

export function HeroSection({
  section,
  project,
  editMode,
  sectionImages,
  sectionImageData,
  editingImageSectionId,
  imagePosition,
  getBackgroundStyle,
  updateSectionContent,
  saveBackgroundPosition,
  setImagePosition,
  onImageClick,
  onEditPositionClick,
  onImagePickerOpen
}: HeroSectionProps) {
  const sectionImage = sectionImageData[section.id]?.[0]
  const currentPos = imagePosition[section.id] || {
    x: sectionImage?.background_position_x ?? 50,
    y: sectionImage?.background_position_y ?? 50,
    zoom: sectionImage?.background_zoom ?? null
  }

  return (
    <header 
      onClick={onImageClick}
      className={`relative min-h-screen flex items-center justify-center px-2 md:px-4 py-20 bg-background ${
        editMode && !sectionImages[section.id]?.[0] ? 'cursor-pointer hover:bg-background/90 transition-colors' : ''
      }`}
      style={sectionImages[section.id]?.[0] 
        ? getBackgroundStyle(section.id, 0)
        : {}
      }
    >
      {/* Redigeringsknapp for bakgrunnsbilde */}
      {editMode && sectionImages[section.id]?.[0] && (
        <button
          onClick={onEditPositionClick}
          className="absolute top-4 right-4 z-20 bg-white/90 hover:bg-white text-dark px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 transition"
          title="Rediger bilde-posisjon"
        >
          {editingImageSectionId === section.id ? '✕ Lukk' : '✏️ Rediger posisjon'}
        </button>
      )}
      
      {/* Zoom/Pan kontroller for Hero */}
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

      <div className="max-w-7xl mx-auto text-center relative z-10">
        <Heading
          as="h1"
          size="2xl"
          className={`mb-6 ${editMode ? 'cursor-text hover:outline hover:outline-2 hover:outline-black/50 hover:outline-dashed rounded px-2 py-1' : ''}`}
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
        <Text
          variant="lead"
          className="max-w-3xl mx-auto"
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
        </Text>
      </div>
    </header>
  )
}

