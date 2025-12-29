import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { CollagePreset, Image } from '@/lib/types'
import { Section } from '@/lib/types'

type CollageImages = {
  pos1: Image | null
  pos2: Image | null
  pos3: Image | null
  pos4: Image | null
  pos5: Image | null
}

type UseCollageImagesProps = {
  id: string
  sections: Section[]
  sectionImages: Record<string, Image[]>
  setCollageImages: (images: CollageImages) => void
  setSelectedPreset: (preset: CollagePreset | null) => void
}

export function useCollageImages({
  id,
  sections,
  sectionImages,
  setCollageImages,
  setSelectedPreset
}: UseCollageImagesProps) {
  useEffect(() => {
    const loadCollageImages = async () => {
      if (!id || sections.length === 0) return
      
      const exampleWorkSection = sections.find(s => s.type === 'example_work')
      if (!exampleWorkSection) return

      // Hent preset ID fra section content
      const presetId = exampleWorkSection.content?.presetId
      
      // Hent bilder fra section_images (som brukes for alle seksjoner)
      const sectionImagesForExampleWork = sectionImages[exampleWorkSection.id] || []
      
      if (sectionImagesForExampleWork.length > 0) {
        // Konverter array til collage format basert på rekkefølge
        const newCollageImages: CollageImages = {
          pos1: sectionImagesForExampleWork[0] || null,
          pos2: sectionImagesForExampleWork[1] || null,
          pos3: sectionImagesForExampleWork[2] || null,
          pos4: sectionImagesForExampleWork[3] || null,
          pos5: sectionImagesForExampleWork[4] || null
        }
        
        console.log('📸 Loading collage images from section_images:', newCollageImages)
        setCollageImages(newCollageImages)

        // Hvis vi har en preset-referanse, hent den også
        if (presetId) {
          const { data: presetData } = await supabase
            .from('collage_presets')
            .select('*')
            .eq('id', presetId)
            .single()
          
          if (presetData) {
            console.log('📸 Loading preset:', presetData)
            setSelectedPreset(presetData)
          }
        }
      } else {
        // Ingen bilder funnet, nullstill
        setCollageImages({ pos1: null, pos2: null, pos3: null, pos4: null, pos5: null })
        setSelectedPreset(null)
      }
    }

    loadCollageImages()
  }, [id, sections, sectionImages, setCollageImages, setSelectedPreset])
}

