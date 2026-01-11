import { supabase } from '@/lib/supabase'
import { Image, SectionImage } from '@/lib/types'

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

