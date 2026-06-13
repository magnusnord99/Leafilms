'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { CollagePreset, Image, CollageImages } from '@/lib/types'
import { Button, Heading, Text, Card } from '@/components/ui'

// Helper for å få full bilde-URL
const getImageUrl = (image: Image) => {
  return supabase.storage.from('assets').getPublicUrl(image.file_path).data.publicUrl
}

// 5 posisjoner
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
      // Single query: fetch presets with all their images in one round-trip
      const { data: presetsData, error: presetsError } = await supabase
        .from('collage_presets')
        .select(`
          id, name, description, keywords, created_at, updated_at,
          collage_preset_images (
            position,
            images (id, filename, file_path, title)
          )
        `)
        .order('id')

      if (presetsError) throw presetsError

      const presetsWithImages: PresetWithImages[] = (presetsData || []).map((preset) => {
        const images: CollageImages = {
          pos1: null, pos2: null, pos3: null, pos4: null, pos5: null
        }

        ;(preset.collage_preset_images as unknown as Array<{ position: string; images: Image | Image[] | null }> || []).forEach((pi) => {
          const pos = pi.position as keyof CollageImages
          if (pos in images) {
            // Supabase join returnerer alltid array; vi tar første element
            images[pos] = Array.isArray(pi.images) ? (pi.images[0] ?? null) : pi.images
          }
        })

        return { ...preset, images }
      })

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
    <div style={{ background: '#0C0B09', padding: 6, borderRadius: 4 }}>
      {/* Pos 1 - full bredde */}
      <div style={{ height: 40, background: '#2A261F', borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
        {images.pos1 ? (
          <img src={getImageUrl(images.pos1)} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ fontSize: 8, color: '#38332A' }}>1</div>
        )}
      </div>
      {/* Midtseksjon */}
      <div className="grid grid-cols-2 gap-1" style={{ height: 80 }}>
        <div style={{ gridRow: 'span 2', background: '#2A261F', borderRadius: 3, overflow: 'hidden' }}>
          {images.pos2 ? (
            <img src={getImageUrl(images.pos2)} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ fontSize: 8, color: '#38332A' }}>2</div>
          )}
        </div>
        <div style={{ background: '#2A261F', borderRadius: 3, overflow: 'hidden' }}>
          {images.pos3 ? (
            <img src={getImageUrl(images.pos3)} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ fontSize: 8, color: '#38332A' }}>3</div>
          )}
        </div>
        <div style={{ background: '#2A261F', borderRadius: 3, overflow: 'hidden' }}>
          {images.pos4 ? (
            <img src={getImageUrl(images.pos4)} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ fontSize: 8, color: '#38332A' }}>4</div>
          )}
        </div>
      </div>
      {/* Pos 5 - full bredde */}
      <div style={{ marginTop: 4, height: 30, background: '#2A261F', borderRadius: 3, overflow: 'hidden' }}>
        {images.pos5 ? (
          <img src={getImageUrl(images.pos5)} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ fontSize: 8, color: '#38332A' }}>5</div>
        )}
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-2 sm:p-6 md:p-8 z-50">
      <Card className="max-w-5xl w-full max-h-[95vh] sm:max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <Heading as="h2" size="md" className="mb-2">Velg bilde-sett</Heading>
            <Text variant="muted">Velg et forhåndsdefinert sett med 5 bilder for collagen</Text>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk"
            style={{ color: '#62594E', lineHeight: 0, flexShrink: 0, marginLeft: 16 }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" d="M2 2l12 12M14 2L2 14" />
            </svg>
          </button>
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

        <div className="flex gap-4 pt-6 border-t border-zinc-800">
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
