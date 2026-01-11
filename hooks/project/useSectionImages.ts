import { useEffect, useState } from 'react'
import React from 'react'
import { supabase } from '@/lib/supabase'
import { Image, SectionImage } from '@/lib/types'

export function useSectionImages(
  sectionImages: Record<string, Image[]>,
  setSectionImages: React.Dispatch<React.SetStateAction<Record<string, Image[]>>>,
  sectionImageData: Record<string, SectionImage[]>,
  setSectionImageData: React.Dispatch<React.SetStateAction<Record<string, SectionImage[]>>>
) {
  const [editingImageSectionId, setEditingImageSectionId] = useState<string | null>(null)
  const [imagePosition, setImagePosition] = useState<Record<string, { x: number; y: number; zoom: number | null }>>({})

  // Initialiser imagePosition når redigering starter
  useEffect(() => {
    if (editingImageSectionId && sectionImageData[editingImageSectionId]?.[0]) {
      const sectionImage = sectionImageData[editingImageSectionId][0]
      setImagePosition(prev => ({
        ...prev,
        [editingImageSectionId]: {
          x: sectionImage.background_position_x ?? 50,
          y: sectionImage.background_position_y ?? 50,
          zoom: sectionImage.background_zoom ?? null
        }
      }))
    }
  }, [editingImageSectionId, sectionImageData])

  // Hent bakgrunnsstil for et bilde basert på posisjon/zoom
  const getBackgroundStyle = (sectionId: string, imageIndex: number = 0) => {
    const sectionImage = sectionImageData[sectionId]?.[imageIndex]
    const image = sectionImages[sectionId]?.[imageIndex]
    
    if (!image) return {}

    const imageUrl = supabase.storage.from('assets').getPublicUrl(image.file_path).data.publicUrl
    
    const currentPos = imagePosition[sectionId] || {
      x: sectionImage?.background_position_x ?? 50,
      y: sectionImage?.background_position_y ?? 50,
      zoom: sectionImage?.background_zoom ?? null
    }

    const backgroundSize = currentPos.zoom === null || currentPos.zoom === 1.0 
      ? 'cover' 
      : `${currentPos.zoom * 100}%`

    return {
      backgroundImage: `url(${imageUrl})`,
      backgroundSize: backgroundSize,
      backgroundPosition: `${currentPos.x}% ${currentPos.y}%`,
      backgroundRepeat: 'no-repeat'
    }
  }

  // Lagre posisjon/zoom for et bakgrunnsbilde
  const saveBackgroundPosition = async (sectionId: string, imageIndex: number, positionX: number, positionY: number, zoom: number | null) => {
    try {
      const sectionImage = sectionImageData[sectionId]?.[imageIndex]
      if (!sectionImage) return

      const { error } = await supabase
        .from('section_images')
        .update({
          background_position_x: positionX,
          background_position_y: positionY,
          background_zoom: zoom,
          updated_at: new Date().toISOString()
        })
        .eq('id', sectionImage.id)

      if (error) throw error

      setSectionImageData((prev: Record<string, SectionImage[]>) => {
        const updated: Record<string, SectionImage[]> = { ...prev }
        if (updated[sectionId] && updated[sectionId][imageIndex]) {
          updated[sectionId] = [...updated[sectionId]]
          updated[sectionId][imageIndex] = {
            ...updated[sectionId][imageIndex],
            background_position_x: positionX,
            background_position_y: positionY,
            background_zoom: zoom
          }
        }
        return updated
      })
    } catch (error) {
      console.error('Error saving background position:', error)
      alert('❌ Kunne ikke lagre posisjon')
    }
  }

  return {
    editingImageSectionId,
    setEditingImageSectionId,
    imagePosition,
    setImagePosition,
    getBackgroundStyle,
    saveBackgroundPosition
  }
}

