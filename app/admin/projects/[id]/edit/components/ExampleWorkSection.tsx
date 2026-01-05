'use client'

import { Section, Image, CollagePreset } from '@/lib/types'
import { Button, Heading, Text } from '@/components/ui'
import { supabase } from '@/lib/supabase'

// Helper for å få full bilde-URL
const getImageUrl = (image: Image) => {
  return supabase.storage.from('assets').getPublicUrl(image.file_path).data.publicUrl
}

// 5 posisjoner i collagen
// Layout:
// ┌─────────────────────────┐
// │          pos1           │ Full bredde topp
// ├───────────┬─────────────┤
// │   pos2    │    pos3     │ pos3 overlapper oppover
// │ row-span-2│             │
// │           ├─────────────┤
// │           │    pos4     │
// ├───────────┴─────────────┤
// │          pos5           │ Full bredde bunn
// └─────────────────────────┘

export type CollagePosition = 'pos1' | 'pos2' | 'pos3' | 'pos4' | 'pos5'

export type CollageImages = {
  pos1: Image | null  // Full bredde topp
  pos2: Image | null  // Venstre, strekker over 2 rader
  pos3: Image | null  // Øverst høyre, overlapper oppover
  pos4: Image | null  // Nederst høyre
  pos5: Image | null  // Full bredde bunn
}

type ExampleWorkSectionProps = {
  section: Section
  editMode: boolean
  collageImages: CollageImages
  selectedPreset: CollagePreset | null
  updateSectionContent: (sectionId: string, key: string, value: string | any) => void
  onImageClick: (position: CollagePosition) => void
  onOpenPresetPicker: () => void
}

export function ExampleWorkSection({
  section,
  editMode,
  collageImages,
  selectedPreset,
  updateSectionContent,
  onImageClick,
  onOpenPresetPicker
}: ExampleWorkSectionProps) {
  
  // Placeholder for bilder som ikke er valgt
  const ImagePlaceholder = ({ position, label }: { position: CollagePosition, label: string }) => (
    <div 
      onClick={() => editMode && onImageClick(position)}
      className={`
        bg-gray-300 flex items-center justify-center h-full w-full
        ${editMode ? 'cursor-pointer hover:bg-gray-400 transition-colors' : ''}
      `}
    >
      <Text variant="muted" className="text-gray-500 text-xs">{label}</Text>
    </div>
  )

  // Rendrer et bilde eller placeholder
  const ImageSlot = ({ position, label, className = '' }: { position: CollagePosition, label: string, className?: string }) => {
    const image = collageImages[position]
    
    return (
      <div className={`overflow-hidden ${className}`}>
        {image ? (
          <img 
            src={getImageUrl(image)}
            alt={`Collage bilde ${label}`}
            onClick={() => editMode && onImageClick(position)}
            className={`
              w-full h-full object-cover
              ${editMode ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}
            `}
          />
        ) : (
          <ImagePlaceholder position={position} label={label} />
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

      {/* 5-bilde Collage Layout */}
      <div className="w-full bg-background-widget">
        {/* Mobile: Vertikal stabling */}
        <div className="flex flex-col md:hidden gap-0">
          <div className="h-[400px]">
            <ImageSlot position="pos1" label="1" className="h-full" />
          </div>
          <div className="h-[400px]">
            <ImageSlot position="pos2" label="2" className="h-full" />
          </div>
          <div className="h-[400px]">
            <ImageSlot position="pos3" label="3" className="h-full" />
          </div>
          <div className="h-[400px]">
            <ImageSlot position="pos4" label="4" className="h-full" />
          </div>
          <div className="h-[400px]">
            <ImageSlot position="pos5" label="5" className="h-full" />
          </div>
        </div>

        {/* Desktop: Kompleks collage layout */}
        <div className="hidden md:block">
          {/* Pos 1 - Full bredde topp */}
          <div className="h-[700px]">
            <ImageSlot position="pos1" label="1" className="h-full" />
          </div>
          
          {/* Midtseksjon: 2 kolonner */}
          <div className="grid grid-cols-2 gap-0">
            {/* Pos 2 - Venstre, strekker over 2 rader */}
            <div className="row-span-2 h-[1000px]">
              <ImageSlot position="pos2" label="2" className="h-full" />
            </div>
            
            {/* Pos 3 - Øverst høyre, overlapper oppover */}
            <div className="h-[600px] -mt-[200px] relative z-10">
              <ImageSlot position="pos3" label="3" className="h-full" />
            </div>
            
            {/* Pos 4 - Nederst høyre */}
            <div className="h-[600px]">
              <ImageSlot position="pos4" label="4" className="h-full" />
            </div>
          </div>
          
          {/* Pos 5 - Full bredde bunn */}
          <div className="h-[600px]">
            <ImageSlot position="pos5" label="5" className="h-full" />
          </div>
        </div>
      </div>
    </div>
  )
}
