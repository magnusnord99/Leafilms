'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { CollagePreset, Image } from '@/lib/types'
import { Button, Card, Heading, Text } from '@/components/ui'

// Helper for å få full bilde-URL
const getImageUrl = (image: Image) => {
  return supabase.storage.from('assets').getPublicUrl(image.file_path).data.publicUrl
}

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

export default function CollagePresetsPage() {
  const router = useRouter()
  const [presets, setPresets] = useState<PresetWithImages[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPresets()
  }, [])

  const loadPresets = async () => {
    setLoading(true)
    try {
      const { data: presetsData, error } = await supabase
        .from('collage_presets')
        .select('*')
        .order('id')

      if (error) throw error

      // Hent bilder for hvert preset
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

  // Mini-preview komponent (5 bilder)
  const CollagePreview = ({ images }: { images: CollageImages }) => (
    <div className="bg-zinc-800 p-2 rounded">
      {/* Pos 1 - full bredde */}
      <div className="h-[40px] bg-zinc-700 rounded overflow-hidden mb-1">
        {images.pos1 ? <img src={getImageUrl(images.pos1)} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs text-zinc-500">1</div>}
      </div>
      {/* Midtseksjon */}
      <div className="grid grid-cols-2 gap-1 h-[80px]">
        <div className="row-span-2 bg-zinc-700 rounded overflow-hidden">
          {images.pos2 ? <img src={getImageUrl(images.pos2)} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs text-zinc-500">2</div>}
        </div>
        <div className="bg-zinc-700 rounded overflow-hidden">
          {images.pos3 ? <img src={getImageUrl(images.pos3)} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs text-zinc-500">3</div>}
        </div>
        <div className="bg-zinc-700 rounded overflow-hidden">
          {images.pos4 ? <img src={getImageUrl(images.pos4)} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs text-zinc-500">4</div>}
        </div>
      </div>
      {/* Pos 5 - full bredde */}
      <div className="mt-1 h-[30px] bg-zinc-700 rounded overflow-hidden">
        {images.pos5 ? <img src={getImageUrl(images.pos5)} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs text-zinc-500">5</div>}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Button
              variant="secondary"
              onClick={() => router.push('/admin/images')}
              className="mb-4 -ml-2"
            >
              ← Tilbake til bilder
            </Button>
            <Heading as="h1" size="lg" className="mb-2 text-white">Bilde-sett (5 bilder)</Heading>
            <Text variant="body" className="text-white">Administrer forhåndsdefinerte bilde-sett for eksempelarbeid-collagen</Text>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
            <Text variant="muted">Laster bilde-sett...</Text>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {presets.map((preset) => (
              <Card key={preset.id} className="bg-zinc-900 overflow-hidden">
                {/* Preview av collage */}
                <div className="p-4 flex justify-center">
                  <div className="max-w-[300px] w-full">
                    <CollagePreview images={preset.images} />
                  </div>
                </div>
                
                {/* Info og handlinger */}
                <div className="p-4 border-t border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <Heading as="h3" size="sm" className="text-white">{preset.name}</Heading>
                    <Text variant="muted" className="text-xs">ID: {preset.id}</Text>
                  </div>
                  {preset.description && (
                    <Text variant="small" className="text-gray-400 mb-4">
                      {preset.description}
                    </Text>
                  )}
                  {preset.keywords && preset.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-4">
                      {preset.keywords.map((keyword, i) => (
                        <span key={i} className="bg-zinc-800 text-xs px-2 py-1 rounded">
                          {keyword}
                        </span>
                      ))}
                    </div>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => router.push(`/admin/images/presets/${preset.id}/edit`)}
                    className="w-full"
                  >
                    ✏️ Rediger sett
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {presets.length === 0 && !loading && (
          <Card className="text-center py-12">
            <Text variant="body" className="mb-4">
              Ingen bilde-sett funnet
            </Text>
            <Text variant="muted">
              Kjør database-migrasjonen for å opprette de 4 standard-settene
            </Text>
          </Card>
        )}
      </div>
    </div>
  )
}
