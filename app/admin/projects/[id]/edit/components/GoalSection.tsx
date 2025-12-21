'use client'

import { Section, Image, SectionImage } from '@/lib/types'
import { Heading, Text } from '@/components/ui'
import { ImagePositionControls } from './ImagePositionControls'

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

  return (
    <div ref={goalSectionRef} className="max-w-7xl mx-auto flex items-start overflow-hiddens">
      <div 
        onClick={onImageClick}
        className={`w-1/2 h-[40vh] bg-zinc-300 flex items-center justify-center relative shadow-lg${
          editMode && !sectionImages[section.id]?.[0] ? 'cursor-pointer hover:bg-zinc-400 transition-colors' : ''
        }`}
        style={{
          ...(sectionImages[section.id]?.[0] 
            ? getBackgroundStyle(section.id, 0)
            : {}),
          transform: editMode 
            ? 'translateX(0)' 
            : `translateX(${(1 - goalSectionProgress) * -100}%)`,
          opacity: editMode ? 1 : goalSectionProgress,
          transition: editMode ? 'none' : 'transform 0.1s ease-out, opacity 0.1s ease-out'
        }}
      >
        {!sectionImages[section.id]?.[0] && (
          <Text variant="muted" className="text-center">
            {editMode ? 'Klikk for å velge bilde' : ''}
          </Text>
        )}
        
        {editMode && sectionImages[section.id]?.[0] && (
          <button
            onClick={onEditPositionClick}
            className="absolute top-2 right-2 z-20 bg-white/90 hover:bg-white text-dark px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 transition text-sm"
            title="Rediger bilde-posisjon"
          >
            {editingImageSectionId === section.id ? '✕' : '✏️'}
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
      
      <div 
        className="bg-background-widget-dark w-1/2 min-h-[20vh] p-12 flex flex-col justify-start self-start shadow-lg"
        style={{
          transform: editMode 
            ? 'translateX(0)' 
            : `translateX(${(1 - goalSectionProgress) * 100}%)`,
          opacity: editMode ? 1 : goalSectionProgress,
          transition: editMode ? 'none' : 'transform 0.1s ease-out, opacity 0.1s ease-out'
        }}
      >
        <Heading as="h2" size="2xl" className="mb-4 text-white">
          {getSectionTitle(section.type)}
        </Heading>
        <Text 
          variant="body" 
          className={`text-white whitespace-pre-wrap ${editMode ? 'cursor-text hover:outline hover:outline-2 hover:outline-white/50 hover:outline-dashed rounded px-2 py-1 min-h-[100px]' : ''}`}
          contentEditable={editMode}
          suppressContentEditableWarning
          onBlur={(e) => {
            if (editMode) {
              updateSectionContent(section.id, 'text', e.currentTarget.textContent || '')
            }
          }}
        >
          {section.content.text || (editMode ? 'Klikk for å redigere...' : 'Ingen tekst lagt til ennå...')}
        </Text>
      </div>
    </div>
  )
}

