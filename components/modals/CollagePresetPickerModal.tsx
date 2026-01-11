'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { CollagePreset, Image } from '@/lib/types'
import { Button, Heading, Text, Card } from '@/components/ui'

// Helper for å få full bilde-URL
const getImageUrl = (image: Image) => {
  return supabase.storage.from('assets').getPublicUrl(image.file_path).data.publicUrl
}

// 5 posisjoner
type CollageImages = {
  pos1: Image | null
  pos2: Image | null
  pos3: Image | null
  pos4: Image | null
  pos5: Image | null
}

type PresetWithImages = CollagePreset & {
  images: CollageImages
}

type CollagePresetPickerModalProps = {
  isOpen: boolean
  onClose: () => void
  onSelect: (preset: PresetWithImages) => void
  selectedPresetId: number | null
}

export function CollagePresetPickerModal({
  isOpen,
  onClose,
  onSelect,
  selectedPresetId
}: CollagePresetPickerModalProps) {
  const [presets, setPresets] = useState<PresetWithImages[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isOpen) {
      loadPresets()
    }
  }, [isOpen])

  const loadPresets = async () => {
    setLoading(true)
    try {
      const { data: presetsData, error: presetsError } = await supabase
        .from('collage_presets')
        .select('*')
        .order('id')

      if (presetsError) throw presetsError

      const presetsWithImages: PresetWithImages[] = await Promise.all(
        (presetsData || []).map(async (preset) => {
          const { data: presetImages } = await supabase
            .from('collage_preset_images')
            .select(`
              position,
              images (*)
            `)
            .eq('preset_id', preset.id)

          const images: CollageImages = {
            pos1: null, pos2: null, pos3: null, pos4: null, pos5: null
          }

          presetImages?.forEach((pi: any) => {
            const pos = pi.position as keyof CollageImages
            if (pos in images) {
              images[pos] = pi.images
            }
          })

          return { ...preset, images }
        })
      )

      setPresets(presetsWithImages)
    } catch (error) {
      console.error('Error loading presets:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  // Mini-preview av collagen (5 bilder)
  const CollagePreview = ({ images }: { images: CollageImages }) => (
    <div className="bg-zinc-100 p-2 rounded">
      {/* Pos 1 - full bredde */}
      <div className="h-[40px] bg-gray-300 rounded overflow-hidden mb-1">
        {images.pos1 ? (
          <img src={getImageUrl(images.pos1)} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[8px] text-gray-500">1</div>
        )}
      </div>
      {/* Midtseksjon */}
      <div className="grid grid-cols-2 gap-1 h-[80px]">
        <div className="row-span-2 bg-gray-300 rounded overflow-hidden">
          {images.pos2 ? (
            <img src={getImageUrl(images.pos2)} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[8px] text-gray-500">2</div>
          )}
        </div>
        <div className="bg-gray-300 rounded overflow-hidden">
          {images.pos3 ? (
            <img src={getImageUrl(images.pos3)} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[8px] text-gray-500">3</div>
          )}
        </div>
        <div className="bg-gray-300 rounded overflow-hidden">
          {images.pos4 ? (
            <img src={getImageUrl(images.pos4)} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[8px] text-gray-500">4</div>
          )}
        </div>
      </div>
      {/* Pos 5 - full bredde */}
      <div className="mt-1 h-[30px] bg-gray-300 rounded overflow-hidden">
        {images.pos5 ? (
          <img src={getImageUrl(images.pos5)} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[8px] text-gray-500">5</div>
        )}
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-8 z-50">
      <Card className="max-w-5xl w-full max-h-[85vh] overflow-y-auto">
        <div className="mb-6">
          <Heading as="h2" size="md" className="mb-2">Velg bilde-sett</Heading>
          <Text variant="muted">Velg et forhåndsdefinert sett med 5 bilder for collagen</Text>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-dark mx-auto mb-4"></div>
            <Text variant="muted">Laster bilde-sett...</Text>
          </div>
        ) : presets.length === 0 ? (
          <div className="text-center py-12">
            <Text variant="body" className="mb-4">
              Ingen bilde-sett opprettet ennå
            </Text>
            <Text variant="muted">
              Gå til Admin → Bilder → Bilde-sett for å opprette sett
            </Text>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {presets.map((preset) => {
              const isSelected = selectedPresetId === preset.id
              
              return (
                <div
                  key={preset.id}
                  onClick={() => onSelect(preset)}
                  className={`
                    cursor-pointer rounded-lg overflow-hidden transition border-2
                    ${isSelected 
                      ? 'border-green-500 ring-2 ring-green-500/30' 
                      : 'border-transparent hover:border-zinc-600'
                    }
                  `}
                >
                  <div className="p-3">
                    <CollagePreview images={preset.images} />
                  </div>
                  
                  <div className="bg-zinc-900 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Heading as="h4" size="sm" className="mb-1 !text-white">
                          {preset.name}
                        </Heading>
                        {preset.description && (
                          <Text variant="small" className="text-gray-400">
                            {preset.description}
                          </Text>
                        )}
                      </div>
                      {isSelected && (
                        <div className="bg-green-500 text-white text-xs px-2 py-1 rounded">
                          ✓ Valgt
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex gap-4 pt-6 border-t border-zinc-200">
          <Button
            type="button"
            onClick={onClose}
            variant="secondary"
            className="flex-1"
          >
            Lukk
          </Button>
        </div>
      </Card>
    </div>
  )
}
