import { useEffect, useRef, useState } from 'react'
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
  const latestSaveBySlotRef = useRef<Record<string, { x: number; y: number; zoom: number | null; sectionImageId: string }>>({})
  const inFlightSaveBySlotRef = useRef<Record<string, boolean>>({})

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

  const flushLatestSaveForSlot = async (slotKey: string) => {
    if (inFlightSaveBySlotRef.current[slotKey]) return
    inFlightSaveBySlotRef.current[slotKey] = true

    try {
      while (latestSaveBySlotRef.current[slotKey]) {
        const payload = latestSaveBySlotRef.current[slotKey]
        delete latestSaveBySlotRef.current[slotKey]

        const { error } = await supabase
          .from('section_images')
          .update({
            background_position_x: payload.x,
            background_position_y: payload.y,
            background_zoom: payload.zoom,
            updated_at: new Date().toISOString()
          })
          .eq('id', payload.sectionImageId)

        if (error) throw error
      }
    } finally {
      inFlightSaveBySlotRef.current[slotKey] = false
    }
  }

  // Lagre posisjon/zoom for et bakgrunnsbilde
  const saveBackgroundPosition = async (sectionId: string, imageIndex: number, positionX: number, positionY: number, zoom: number | null) => {
    try {
      const rows = sectionImageData[sectionId] || []
      // For collage slots, imageIndex is the source of truth for position mapping.
      // Using image_id lookup can target the wrong row when same image is reused.
      const sectionImage = rows.find(row => row.order_index === imageIndex) || rows[imageIndex]
      const sectionImageRowIndex = sectionImage
        ? rows.findIndex((row) => row.id === sectionImage.id)
        : -1
      if (!sectionImage) {
        return
      }
      const slotKey = `${sectionId}:${imageIndex}`
      latestSaveBySlotRef.current[slotKey] = {
        x: positionX,
        y: positionY,
        zoom,
        sectionImageId: sectionImage.id
      }
      await flushLatestSaveForSlot(slotKey)

      setSectionImageData((prev: Record<string, SectionImage[]>) => {
        const updated: Record<string, SectionImage[]> = { ...prev }
        const targetIndex = sectionImageRowIndex >= 0 ? sectionImageRowIndex : imageIndex
        if (updated[sectionId] && updated[sectionId][targetIndex]) {
          updated[sectionId] = [...updated[sectionId]]
          updated[sectionId][targetIndex] = {
            ...updated[sectionId][targetIndex],
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

