import { supabase } from '@/lib/supabase'
import { Image, SectionImage, VideoLibrary, SectionVideo } from '@/lib/types'

export async function saveSectionImages(
  sectionId: string,
  imageIds: string[]
): Promise<{ images: Image[]; sectionImages: SectionImage[] }> {
  // Verifiser at sectionId faktisk finnes først
  const { data: sectionCheck } = await supabase
    .from('sections')
    .select('id, type')
    .eq('id', sectionId)
    .single()
  
  if (!sectionCheck) {
    console.error('❌ Section not found:', sectionId)
    throw new Error(`Section ${sectionId} not found`)
  }
  // Slett eksisterende bilder for denne seksjonen
  const { error: deleteError } = await supabase
    .from('section_images')
    .delete()
    .eq('section_id', sectionId)
    .select('id')

  if (deleteError) {
    console.error('❌ Error deleting existing images:', deleteError)
    throw deleteError
  }

  // Legg til nye bilder
  if (imageIds.length > 0) {
    const sectionImagesToInsert = imageIds.map((imageId, index) => ({
      section_id: sectionId,
      image_id: imageId,
      order_index: index,
      position: 'background'
    }))

    const { error: insertError, data: insertData } = await supabase
      .from('section_images')
      .insert(sectionImagesToInsert)
      .select('*')

    if (insertError) {
      console.error('Error inserting images:', insertError)
      console.error('Insert error details:', JSON.stringify(insertError, null, 2))
      throw new Error(`Failed to insert images: ${insertError.message || JSON.stringify(insertError)}`)
    }

    if (!insertData || insertData.length === 0) {
      console.error('❌ CRITICAL: No images were inserted!')
      throw new Error('Failed to insert images - no data returned')
    }

    // Bruk data fra insert i stedet for å hente på nytt
    const insertedSectionImages = (insertData || []) as SectionImage[]
    
    // Hent bildene i riktig rekkefølge basert på inserted data
    const fetchedImageIds = insertedSectionImages.map(si => si.image_id)
    const { data: imagesData, error: imagesError } = await supabase
      .from('images')
      .select('*')
      .in('id', fetchedImageIds)

    if (imagesError) {
      console.error('Error fetching images:', imagesError)
      throw imagesError
    }

    // Sorter bildene i samme rekkefølge som section_images
    const images = fetchedImageIds
      .map(id => imagesData?.find(img => img.id === id))
      .filter(Boolean) as Image[]

    return {
      images,
      sectionImages: insertedSectionImages
    }
  } else {
    return {
      images: [],
      sectionImages: []
    }
  }
}

export async function saveBackgroundPosition(
  sectionImageId: string,
  positionX: number,
  positionY: number,
  zoom: number | null
): Promise<void> {
  // Midlertidig: Hopp over hvis kolonnene ikke finnes (migrasjon ikke kjørt)
  // TODO: Kjøre migrasjon 009_background_image_position.sql
  try {
    const { error } = await supabase
      .from('section_images')
      .update({
        background_position_x: positionX,
        background_position_y: positionY,
        background_zoom: zoom,
        updated_at: new Date().toISOString()
      })
      .eq('id', sectionImageId)

    if (error) {
      // Hvis kolonnene ikke finnes, bare logg og fortsett
      if (error.message?.includes('does not exist')) {
        console.warn('Background position columns not found. Run migration 009_background_image_position.sql')
        return
      }
      throw error
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('does not exist')) {
      console.warn('Background position columns not found. Run migration 009_background_image_position.sql')
      return
    }
    throw error
  }
}

export async function saveSectionVideos(
  sectionId: string,
  videoIds: string[]
): Promise<{ videos: VideoLibrary[]; sectionVideos: SectionVideo[] }> {
  // Verifiser at sectionId faktisk finnes først
  const { data: sectionCheck } = await supabase
    .from('sections')
    .select('id, type')
    .eq('id', sectionId)
    .single()
  
  if (!sectionCheck) {
    console.error('❌ Section not found:', sectionId)
    throw new Error(`Section ${sectionId} not found`)
  }
  // Slett eksisterende videoer for denne seksjonen
  const { error: deleteError } = await supabase
        .from('section_video_library')
    .delete()
    .eq('section_id', sectionId)
    .select('id')

  if (deleteError) {
    console.error('❌ Error deleting existing videos:', deleteError)
    throw deleteError
  }

  // Legg til nye videoer
  if (videoIds.length > 0) {
    const sectionVideosToInsert = videoIds.map((videoId, index) => ({
      section_id: sectionId,
      video_id: videoId,
      order_index: index,
      position: 'background',
      autoplay: true,
      loop: true,
      muted: true
    }))

    const { error: insertError, data: insertData } = await supabase
        .from('section_video_library')
      .insert(sectionVideosToInsert)
      .select('*')

    if (insertError) {
      console.error('Error inserting videos:', insertError)
      throw new Error(`Failed to insert videos: ${insertError.message || JSON.stringify(insertError)}`)
    }

    if (!insertData || insertData.length === 0) {
      console.error('❌ CRITICAL: No videos were inserted!')
      throw new Error('Failed to insert videos - no data returned')
    }

    const insertedSectionVideos = (insertData || []) as SectionVideo[]
    
    // Hent videoene i riktig rekkefølge basert på inserted data
    const fetchedVideoIds = insertedSectionVideos.map(sv => sv.video_id)
    const { data: videosData, error: videosError } = await supabase
        .from('video_library')
      .select('*')
      .in('id', fetchedVideoIds)

    if (videosError) {
      console.error('Error fetching videos:', videosError)
      throw videosError
    }

    // Sorter videoene i samme rekkefølge som section_videos
    const videos = fetchedVideoIds
      .map(id => videosData?.find(vid => vid.id === id))
      .filter(Boolean) as VideoLibrary[]

    return {
      videos,
      sectionVideos: insertedSectionVideos
    }
  } else {
    return {
      videos: [],
      sectionVideos: []
    }
  }
}
