'use client'

import { Section, Image, SectionImage } from '@/lib/types'
import { Heading, Text } from '@/components/ui'
import { DeliverableGrid } from '@/components/project'
import { ImagePositionControls } from '@/components/project'

type DeliverablesSectionProps = {
  section: Section
  editMode: boolean
  sectionImages: Record<string, Image[]>
  sectionImageData: Record<string, SectionImage[]>
  editingImageSectionId: string | null
  imagePosition: Record<string, { x: number; y: number; zoom: number | null }>
  getBackgroundStyle: (sectionId: string, imageIndex?: number) => React.CSSProperties
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

  return (
    <div className="w-full">
      <div className="mt-12 mb-8 mx-0 md:mx-0 lg:mx-0 xl:mx-0">
        <div 
          onClick={onImageClick}
          className={`bg-gray-800 pt-12 pb-12 pr-12 min-h-[800px] flex flex-col items-start justify-between w-full relative ${
            editMode && !sectionImages[section.id]?.[0] ? 'cursor-pointer hover:bg-gray-700 transition-colors' : ''
          }`}
          style={sectionImages[section.id]?.[0] 
            ? getBackgroundStyle(section.id, 0)
            : {}
          }
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
          
          <div className="mt-24 mb-8 w-full px-0 md:px-0">
            <div className="bg-background-widget-dark p-4 md:p-8 w-full md:w-1/2 max-w-full">
              <Heading 
                as="h3" 
                className="mb-4 break-words text-white"
                onClick={(e) => e.stopPropagation()}
              >
                {getSectionTitle(section.type)}
              </Heading>
              <Text 
                variant="lead"
                className={`max-w-[500px] whitespace-pre-wrap break-words overflow-wrap-anywhere text-white ${editMode ? 'cursor-text hover:outline hover:outline-2 hover:outline-black/50 hover:outline-dashed rounded px-4 py-2' : ''}`}
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
                {section.content.text || 'Vi leverer et bredt spekter av innhold tilpasset ulike plattformer. Innholdet består av produktbilder i unike, naturlige omgivelser, actionbilder og dokumentarisk materiale som forteller en historie.'}
              </Text>
              <div onClick={(e) => e.stopPropagation()} className="min-h-[150px] w-full overflow-x-hidden">
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
      </div>
    </div>
  )
}

