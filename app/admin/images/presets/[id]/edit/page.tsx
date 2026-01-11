'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { CollagePreset, Image } from '@/lib/types'
import { Button, Card, Heading, Text, Input, Textarea } from '@/components/ui'
import { ImagePickerModal } from '@/components/modals'

// Helper for å få full bilde-URL
const getImageUrl = (image: Image) => {
  return supabase.storage.from('assets').getPublicUrl(image.file_path).data.publicUrl
}

type Props = {
  params: Promise<{ id: string }>
}

type Position = 'pos1' | 'pos2' | 'pos3' | 'pos4' | 'pos5'

type CollageImages = {
  pos1: Image | null
  pos2: Image | null
  pos3: Image | null
  pos4: Image | null
  pos5: Image | null
}

export default function EditPresetPage({ params }: Props) {
  const router = useRouter()
  const { id } = use(params)
  const presetId = parseInt(id)
  
  const [preset, setPreset] = useState<CollagePreset | null>(null)
  const [images, setImages] = useState<CollageImages>({
    pos1: null, pos2: null, pos3: null, pos4: null, pos5: null
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [editingPosition, setEditingPosition] = useState<Position | null>(null)
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    keywords: ''
  })

  useEffect(() => {
    loadPreset()
  }, [presetId])

  const loadPreset = async () => {
    setLoading(true)
    try {
      const { data: presetData, error: presetError } = await supabase
        .from('collage_presets')
        .select('*')
        .eq('id', presetId)
        .single()

      if (presetError) throw presetError
      
      setPreset(presetData)
      setFormData({
        name: presetData.name,
        description: presetData.description || '',
        keywords: (presetData.keywords || []).join(', ')
      })

      const { data: presetImages } = await supabase
        .from('collage_preset_images')
        .select(`
          position,
          images (*)
        `)
        .eq('preset_id', presetId)

      const loadedImages: CollageImages = {
        pos1: null, pos2: null, pos3: null, pos4: null, pos5: null
      }

      presetImages?.forEach((pi: any) => {
        const pos = pi.position as Position
        if (pos in loadedImages) {
          loadedImages[pos] = pi.images
        }
      })

      setImages(loadedImages)
    } catch (error) {
      console.error('Error loading preset:', error)
      alert('Kunne ikke laste bilde-sett')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const keywords = formData.keywords
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0)

      const { error: updateError } = await supabase
        .from('collage_presets')
        .update({
          name: formData.name,
          description: formData.description || null,
          keywords: keywords
        })
        .eq('id', presetId)

      if (updateError) throw updateError

      // Bilde-sett lagret
    } catch (error) {
      console.error('Error saving preset:', error)
      alert('❌ Kunne ikke lagre')
    } finally {
      setSaving(false)
    }
  }

  const handleImageSelect = async (imageIds: string[]) => {
    if (!editingPosition || imageIds.length === 0) return

    const imageId = imageIds[0]

    try {
      const { data: existing } = await supabase
        .from('collage_preset_images')
        .select('id')
        .eq('preset_id', presetId)
        .eq('position', editingPosition)
        .single()

      if (existing) {
        await supabase
          .from('collage_preset_images')
          .update({ image_id: imageId })
          .eq('id', existing.id)
      } else {
        await supabase
          .from('collage_preset_images')
          .insert({
            preset_id: presetId,
            image_id: imageId,
            position: editingPosition
          })
      }

      const { data: newImage } = await supabase
        .from('images')
        .select('*')
        .eq('id', imageId)
        .single()

      setImages(prev => ({
        ...prev,
        [editingPosition]: newImage
      }))
    } catch (error) {
      console.error('Error saving image:', error)
      alert('❌ Kunne ikke lagre bilde')
    } finally {
      setShowImagePicker(false)
      setEditingPosition(null)
    }
  }

  const handleRemoveImage = async (position: Position) => {
    try {
      await supabase
        .from('collage_preset_images')
        .delete()
        .eq('preset_id', presetId)
        .eq('position', position)

      setImages(prev => ({
        ...prev,
        [position]: null
      }))
    } catch (error) {
      console.error('Error removing image:', error)
    }
  }

  const ImageSlot = ({ position, label, className = '' }: { position: Position, label: string, className?: string }) => {
    const image = images[position]
    
    return (
      <div className={`relative group ${className}`}>
        {image ? (
          <div className="relative h-full">
            <img 
              src={getImageUrl(image)} 
              alt={label}
              className="w-full h-full object-cover rounded-lg"
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setEditingPosition(position)
                  setShowImagePicker(true)
                }}
              >
                Bytt
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => handleRemoveImage(position)}
              >
                Fjern
              </Button>
            </div>
          </div>
        ) : (
          <div 
            onClick={() => {
              setEditingPosition(position)
              setShowImagePicker(true)
            }}
            className="w-full h-full bg-zinc-800 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-700 transition-colors"
          >
            <Text variant="muted" className="text-2xl mb-1">+</Text>
            <Text variant="small" className="text-gray-500">{label}</Text>
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
          <Text variant="muted">Laster...</Text>
        </div>
      </div>
    )
  }

  if (!preset) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Text variant="body">Bilde-sett ikke funnet</Text>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => router.push('/admin/images/presets')}
            className="mb-4 -ml-2"
          >
            ← Tilbake til bilde-sett
          </Button>
          <Heading as="h1" size="lg" className="mb-2">Rediger: {preset.name}</Heading>
          <Text variant="muted">Velg bilder for hver av de 5 posisjonene i collagen</Text>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Collage preview */}
          <div className="lg:col-span-2">
            <Heading as="h2" size="sm" className="mb-4">Collage-layout (5 bilder)</Heading>
            <div className="bg-zinc-900 p-4 rounded-lg">
              {/* Pos 1 - full bredde topp */}
              <div className="h-[100px] mb-2">
                <ImageSlot position="pos1" label="1 - Full bredde topp" className="h-full" />
              </div>
              {/* Midtseksjon */}
              <div className="grid grid-cols-2 gap-2">
                <div className="row-span-2 h-[200px]">
                  <ImageSlot position="pos2" label="2 - Venstre" className="h-full" />
                </div>
                <div className="h-[100px]">
                  <ImageSlot position="pos3" label="3 - Øverst høyre" className="h-full" />
                </div>
                <div className="h-[100px]">
                  <ImageSlot position="pos4" label="4 - Nederst høyre" className="h-full" />
                </div>
              </div>
              {/* Pos 5 - full bredde bunn */}
              <div className="mt-2 h-[80px]">
                <ImageSlot position="pos5" label="5 - Full bredde bunn" className="h-full" />
              </div>
            </div>
          </div>

          {/* Form */}
          <div>
            <Heading as="h2" size="sm" className="mb-4">Sett-informasjon</Heading>
            <Card className="bg-zinc-900">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-300">
                    Navn *
                  </label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="F.eks. Industri & Arbeidsliv"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-300">
                    Beskrivelse
                  </label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Kort beskrivelse av settet..."
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-300">
                    Nøkkelord (kommaseparert)
                  </label>
                  <Input
                    value={formData.keywords}
                    onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                    placeholder="industri, fabrikk, arbeid"
                  />
                  <Text variant="muted" className="text-xs mt-1">
                    Brukes av AI for matching
                  </Text>
                </div>

                <Button
                  onClick={handleSave}
                  disabled={saving || !formData.name}
                  variant="primary"
                  className="w-full"
                >
                  {saving ? 'Lagrer...' : '💾 Lagre endringer'}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>

      <ImagePickerModal
        isOpen={showImagePicker}
        onClose={() => {
          setShowImagePicker(false)
          setEditingPosition(null)
        }}
        onSelect={handleImageSelect}
        selectedImageIds={[]}
      />
    </div>
  )
}
