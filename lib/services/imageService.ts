import { supabase } from '@/lib/supabase'
import { Image, SectionImage, VideoLibrary, SectionVideo } from '@/lib/types'

export async function saveSectionImages(
  sectionId: string,
  imageIds: string[]
): Promise<{ images: Image[]; sectionImages: SectionImage[] }> {
  console.log('💾 saveSectionImages called with:', { sectionId, imageIds })
  
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
  console.log('✅ Section found:', sectionCheck)
  
  // Slett eksisterende bilder for denne seksjonen
  const { data: existingImages, error: fetchError } = await supabase
    .from('section_images')
    .select('id, image_id, order_index')
    .eq('section_id', sectionId)
  
  if (fetchError) {
    console.error('Error fetching existing images:', fetchError)
  } else {
    console.log('📋 Existing images before delete:', existingImages)
  }
  
  const { error: deleteError, count: deleteCount } = await supabase
    .from('section_images')
    .delete()
    .eq('section_id', sectionId)
    .select('id')

  if (deleteError) {
    console.error('❌ Error deleting existing images:', deleteError)
    throw deleteError
  }
  console.log(`✅ Deleted ${deleteCount || existingImages?.length || 0} existing images for section ${sectionId}`)

  // Legg til nye bilder
  if (imageIds.length > 0) {
    const sectionImagesToInsert = imageIds.map((imageId, index) => ({
      section_id: sectionId,
      image_id: imageId,
      order_index: index,
      position: 'background'
    }))

    console.log('Inserting section images:', sectionImagesToInsert)
    const { error: insertError, data: insertData } = await supabase
      .from('section_images')
      .insert(sectionImagesToInsert)
      .select('*')

    if (insertError) {
      console.error('Error inserting images:', insertError)
      console.error('Insert error details:', JSON.stringify(insertError, null, 2))
      throw new Error(`Failed to insert images: ${insertError.message || JSON.stringify(insertError)}`)
    }
    console.log('✅ Inserted section images:', insertData)
    
    if (!insertData || insertData.length === 0) {
      console.error('❌ CRITICAL: No images were inserted!')
      throw new Error('Failed to insert images - no data returned')
    }

    // Verifiser at bildene faktisk ble lagret
    const { data: verifyData, error: verifyError } = await supabase
      .from('section_images')
      .select('*')
      .eq('section_id', sectionId)
      .order('order_index', { ascending: true })
    
    if (verifyError) {
      console.error('❌ Error verifying inserted images:', verifyError)
    } else {
      console.log('✅ Verified inserted images in database:', verifyData)
      if (!verifyData || verifyData.length !== imageIds.length) {
        console.error(`❌ CRITICAL: Expected ${imageIds.length} images, but found ${verifyData?.length || 0} in database!`)
      }
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

    console.log('Returning images and sectionImages:', { images, sectionImages: insertedSectionImages })
    return {
      images,
      sectionImages: insertedSectionImages
    }
  } else {
    console.log('No images to insert, returning empty arrays')
    return {
      images: [],
      sectionImages: []
    }
  }
}

async function fetchImagesForSectionRows(sectionImages: SectionImage[]): Promise<Image[]> {
  const imageIds = sectionImages.map(si => si.image_id)
  const { data: imagesData, error: imagesError } = await supabase
    .from('images')
    .select('*')
    .in('id', imageIds)

  if (imagesError) {
    console.error('Error fetching images:', imagesError)
    throw imagesError
  }

  return imageIds
    .map(id => imagesData?.find(img => img.id === id))
    .filter(Boolean) as Image[]
}

async function fetchSectionImageRows(sectionId: string): Promise<SectionImage[]> {
  const { data, error } = await supabase
    .from('section_images')
    .select('*')
    .eq('section_id', sectionId)
    .order('order_index', { ascending: true })

  if (error) {
    console.error('Error fetching section image rows:', error)
    throw error
  }

  return (data || []) as SectionImage[]
}

export async function replaceSectionImageAtIndex(
  sectionId: string,
  imageId: string,
  orderIndex: number
): Promise<{ images: Image[]; sectionImages: SectionImage[] }> {
  if (!imageId) {
    throw new Error('Missing image ID')
  }
  if (!Number.isInteger(orderIndex) || orderIndex < 0) {
    throw new Error('Invalid image order index')
  }

  const { data: existingRows, error: fetchError } = await supabase
    .from('section_images')
    .select('id')
    .eq('section_id', sectionId)
    .eq('order_index', orderIndex)

  if (fetchError) {
    console.error('Error fetching existing image slot:', fetchError)
    throw fetchError
  }

  if (existingRows && existingRows.length > 0) {
    const { error: updateError } = await supabase
      .from('section_images')
      .update({
        image_id: imageId,
        updated_at: new Date().toISOString()
      })
      .eq('section_id', sectionId)
      .eq('order_index', orderIndex)

    if (updateError) {
      console.error('Error updating image slot:', updateError)
      throw updateError
    }
  } else {
    const { error: insertError } = await supabase
      .from('section_images')
      .insert({
        section_id: sectionId,
        image_id: imageId,
        order_index: orderIndex,
        position: 'background'
      })

    if (insertError) {
      console.error('Error inserting image slot:', insertError)
      throw insertError
    }
  }

  const sectionImages = await fetchSectionImageRows(sectionId)
  const images = await fetchImagesForSectionRows(sectionImages)

  return { images, sectionImages }
}

export async function saveSectionImageSlots(
  sectionId: string,
  imageIdsByOrder: Array<string | null | undefined>
): Promise<{ images: Image[]; sectionImages: SectionImage[] }> {
  const { error: deleteError } = await supabase
    .from('section_images')
    .delete()
    .eq('section_id', sectionId)

  if (deleteError) {
    console.error('Error deleting existing image slots:', deleteError)
    throw deleteError
  }

  const rowsToInsert = imageIdsByOrder.flatMap((imageId, orderIndex) => imageId ? [{
    section_id: sectionId,
    image_id: imageId,
    order_index: orderIndex,
    position: 'background'
  }] : [])

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await supabase
      .from('section_images')
      .insert(rowsToInsert)

    if (insertError) {
      console.error('Error inserting image slots:', insertError)
      throw insertError
    }
  }

  const sectionImages = await fetchSectionImageRows(sectionId)
  const images = await fetchImagesForSectionRows(sectionImages)

  return { images, sectionImages }
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
  } catch (error: any) {
    if (error?.message?.includes('does not exist')) {
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
  console.log('💾 saveSectionVideos called with:', { sectionId, videoIds })
  
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
  console.log('✅ Section found:', sectionCheck)
  
  // Slett eksisterende videoer for denne seksjonen
  const { data: existingVideos, error: fetchError } = await supabase
        .from('section_video_library')
    .select('id, video_id, order_index')
    .eq('section_id', sectionId)
  
  if (fetchError) {
    console.error('Error fetching existing videos:', fetchError)
  } else {
    console.log('📋 Existing videos before delete:', existingVideos)
  }
  
  const { error: deleteError, count: deleteCount } = await supabase
        .from('section_video_library')
    .delete()
    .eq('section_id', sectionId)
    .select('id')

  if (deleteError) {
    console.error('❌ Error deleting existing videos:', deleteError)
    throw deleteError
  }
  console.log(`✅ Deleted ${deleteCount || existingVideos?.length || 0} existing videos for section ${sectionId}`)

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

    console.log('Inserting section videos:', sectionVideosToInsert)
    const { error: insertError, data: insertData } = await supabase
        .from('section_video_library')
      .insert(sectionVideosToInsert)
      .select('*')

    if (insertError) {
      console.error('Error inserting videos:', insertError)
      throw new Error(`Failed to insert videos: ${insertError.message || JSON.stringify(insertError)}`)
    }
    console.log('✅ Inserted section videos:', insertData)
    
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

    console.log('Returning videos and sectionVideos:', { videos, sectionVideos: insertedSectionVideos })
    return {
      videos,
      sectionVideos: insertedSectionVideos
    }
  } else {
    console.log('No videos to insert, returning empty arrays')
    return {
      videos: [],
      sectionVideos: []
    }
  }
}
