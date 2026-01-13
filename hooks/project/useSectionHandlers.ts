import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Section, CollagePreset, Image, VideoLibrary, SectionVideo } from '@/lib/types'
import { saveSectionImages, saveSectionVideos } from '@/lib/services/imageService'

type UseSectionHandlersProps = {
  project: any
  sections: Section[]
  setSections: (sections: Section[] | ((prev: Section[]) => Section[])) => void
  selectedCaseIds: string[]
  setSelectedCaseIds: (ids: string[] | ((prev: string[]) => string[])) => void
  selectedTeamMemberIds: string[]
  setSelectedTeamMemberIds: (ids: string[] | ((prev: string[]) => string[])) => void
  sectionImages: Record<string, Image[]>
  setSectionImages: (images: Record<string, Image[]> | ((prev: Record<string, Image[]>) => Record<string, Image[]>)) => void
  sectionImageData: Record<string, any[]>
  setSectionImageData: (data: Record<string, any[]> | ((prev: Record<string, any[]>) => Record<string, any[]>)) => void
  sectionVideos: Record<string, VideoLibrary[]>
  setSectionVideos: (videos: Record<string, VideoLibrary[]> | ((prev: Record<string, VideoLibrary[]>) => Record<string, VideoLibrary[]>)) => void
  sectionVideoData: Record<string, SectionVideo[]>
  setSectionVideoData: (data: Record<string, SectionVideo[]> | ((prev: Record<string, SectionVideo[]>) => Record<string, SectionVideo[]>)) => void
  imagePickerSectionId: string | null
  setImagePickerSectionId: (id: string | null) => void
  videoPickerSectionId: string | null
  setVideoPickerSectionId: (id: string | null) => void
  setShowImagePicker: (show: boolean) => void
  setShowVideoPicker: (show: boolean) => void
  setShowCasePicker: (show: boolean) => void
  setShowTeamPicker: (show: boolean) => void
  editMode: boolean
  autoSave: () => void
  refreshData?: () => Promise<void>
  setCollageImages: (images: any) => void
  setSelectedPreset: (preset: CollagePreset | null) => void
  setShowPresetPicker: (show: boolean) => void
}

export function useSectionHandlers({
  project,
  sections,
  setSections,
  selectedCaseIds,
  setSelectedCaseIds,
  selectedTeamMemberIds,
  setSelectedTeamMemberIds,
  sectionImages,
  setSectionImages,
  sectionImageData,
  setSectionImageData,
  sectionVideos,
  setSectionVideos,
  sectionVideoData,
  setSectionVideoData,
  imagePickerSectionId,
  setImagePickerSectionId,
  videoPickerSectionId,
  setVideoPickerSectionId,
  setShowImagePicker,
  setShowVideoPicker,
  setShowCasePicker,
  setShowTeamPicker,
  editMode,
  autoSave,
  refreshData,
  setCollageImages,
  setSelectedPreset,
  setShowPresetPicker
}: UseSectionHandlersProps) {
  // Oppdater seksjon i state
  const updateSection = (sectionId: string, field: string, value: any) => {
    setSections(sections.map(s => 
      s.id === sectionId 
        ? { ...s, [field]: value }
        : s
    ))
  }

  // Oppdater content-feltet i en seksjon
  const updateSectionContent = (sectionId: string, key: string, value: string | any) => {
    setSections(sections.map(s => 
      s.id === sectionId 
        ? { ...s, content: { ...s.content, [key]: value } }
        : s
    ))
    // Trigger auto-save hvis edit mode er på
    if (editMode) {
      autoSave()
    }
  }

  // Legg til quote-seksjon
  const addQuoteSection = async () => {
    if (!project) return

    // Sjekk om quote-seksjon allerede finnes
    const existingQuote = sections.find(s => s.type === 'quote')
    if (existingQuote) {
      // Hvis den finnes men er skjult, vis den
      if (!existingQuote.visible) {
        const { error } = await supabase
          .from('sections')
          .update({ visible: true, updated_at: new Date().toISOString() })
          .eq('id', existingQuote.id)
        
        if (!error) {
          updateSection(existingQuote.id, 'visible', true)
        }
      }
      return
    }

    try {
      // Finn høyeste order_index
      const maxOrderIndex = Math.max(...sections.map(s => s.order_index), 0)
      
      const { data: newSection, error } = await supabase
        .from('sections')
        .insert({
          project_id: project.id,
          type: 'quote',
          content: {},
          visible: true,
          order_index: maxOrderIndex + 1
        })
        .select()
        .single()

      if (error) throw error

      // Oppdater state
      setSections([...sections, newSection])
    } catch (error) {
      console.error('Error adding quote section:', error)
      alert('❌ Kunne ikke legge til pristilbud-seksjon')
    }
  }

  // Endre rekkefølge på seksjoner
  const handleMoveSection = async (sectionId: string, direction: 'up' | 'down') => {
    const sectionIndex = sections.findIndex(s => s.id === sectionId)
    if (sectionIndex === -1) return

    const newIndex = direction === 'up' ? sectionIndex - 1 : sectionIndex + 1
    if (newIndex < 0 || newIndex >= sections.length) return

    const currentSection = sections[sectionIndex]
    const targetSection = sections[newIndex]

    try {
      // Swap order_index values
      const { error: error1 } = await supabase
        .from('sections')
        .update({ order_index: targetSection.order_index, updated_at: new Date().toISOString() })
        .eq('id', currentSection.id)

      if (error1) throw error1

      const { error: error2 } = await supabase
        .from('sections')
        .update({ order_index: currentSection.order_index, updated_at: new Date().toISOString() })
        .eq('id', targetSection.id)

      if (error2) throw error2

      // Oppdater state
      setSections(sections.map(s => 
        s.id === currentSection.id 
          ? { ...s, order_index: targetSection.order_index }
          : s.id === targetSection.id
          ? { ...s, order_index: currentSection.order_index }
          : s
      ))

      // Refresh for å få oppdatert rekkefølge
      window.location.reload()
    } catch (error) {
      console.error('Error moving section:', error)
      alert('❌ Kunne ikke endre rekkefølge')
    }
  }

  // Håndter case-valg
  const toggleCaseSelection = (caseId: string) => {
    setSelectedCaseIds(prev => {
      if (prev.includes(caseId)) {
        return prev.filter(id => id !== caseId)
      } else {
        if (prev.length >= 4) {
          alert('⚠️ Du kan maks velge 4 case studies')
          return prev
        }
        return [...prev, caseId]
      }
    })
  }

  // Håndter team-valg
  const toggleTeamSelection = (teamMemberId: string) => {
    setSelectedTeamMemberIds(prev => {
      if (prev.includes(teamMemberId)) {
        return prev.filter(id => id !== teamMemberId)
      } else {
        return [...prev, teamMemberId]
      }
    })
  }

  // Lagre team-valg
  const saveTeamSelection = async () => {
    const teamSection = sections.find(s => s.type === 'team')
    if (!teamSection?.id) return

    try {
      await supabase
        .from('section_team_members')
        .delete()
        .eq('section_id', teamSection.id)

      if (selectedTeamMemberIds.length > 0) {
        const inserts = selectedTeamMemberIds.map((teamMemberId, index) => ({
          section_id: teamSection.id,
          team_member_id: teamMemberId,
          order_index: index
        }))

        const { error } = await supabase
          .from('section_team_members')
          .insert(inserts)

        if (error) throw error
      }

      setShowTeamPicker(false)
    } catch (error) {
      console.error('Error saving team members:', error)
      alert('❌ Kunne ikke lagre team-medlemmer')
    }
  }

  // Håndter bildevalg
  const handleImageSelect = async (imageIds: string[]) => {
    if (!imagePickerSectionId) {
      console.error('❌ No imagePickerSectionId set! Cannot save images.')
      return
    }

    try {
      console.log('💾 [handleImageSelect] Saving images for section:', imagePickerSectionId, 'imageIds:', imageIds)
      const result = await saveSectionImages(imagePickerSectionId, imageIds)
      console.log('✅ Save result:', result)
      
      if (!result.images || result.images.length === 0) {
        console.warn('⚠️ No images returned from saveSectionImages')
      }
      
      // Verifiser at bildene faktisk ble lagret i databasen
      const { data: verifyData, error: verifyError } = await supabase
        .from('section_images')
        .select('*')
        .eq('section_id', imagePickerSectionId)
        .order('order_index', { ascending: true })
      
      if (verifyError) {
        console.error('❌ Error verifying saved images:', verifyError)
      } else {
        console.log('✅ Verified saved images in database:', verifyData)
        if (!verifyData || verifyData.length === 0) {
          console.error('❌ CRITICAL: Images were not saved to database!')
          alert('⚠️ Bildene ble ikke lagret i databasen. Prøv igjen.')
          return
        }
      }
      
      setSectionImages(prev => {
        const updated = {
          ...prev,
          [imagePickerSectionId]: result.images
        }
        console.log('✅ Updated sectionImages state:', updated)
        return updated
      })
      
      setSectionImageData(prev => {
        const updated = {
          ...prev,
          [imagePickerSectionId]: result.sectionImages
        }
        console.log('✅ Updated sectionImageData state:', updated)
        return updated
      })
      
      // Refresh data fra databasen for å sikre at alt er synkronisert
      if (refreshData) {
        console.log('🔄 Refreshing data from database...')
        await refreshData()
        console.log('✅ Data refreshed successfully')
      }
    } catch (error) {
      console.error('❌ Error saving images:', error)
      const errorMessage = error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : 'Ukjent feil')
      alert('❌ Kunne ikke lagre bilder: ' + errorMessage)
    } finally {
      setShowImagePicker(false)
      setImagePickerSectionId(null)
    }
  }

  const handleVideoSelect = async (videoIds: string[]) => {
    if (!videoPickerSectionId) {
      console.error('❌ No videoPickerSectionId set! Cannot save videos.')
      return
    }

    try {
      console.log('💾 [handleVideoSelect] Saving videos for section:', videoPickerSectionId, 'videoIds:', videoIds)
      const result = await saveSectionVideos(videoPickerSectionId, videoIds)
      console.log('✅ Save result:', result)
      
      if (!result.videos || result.videos.length === 0) {
        console.warn('⚠️ No videos returned from saveSectionVideos')
      }
      
      // Verifiser at videoene faktisk ble lagret i databasen
      const { data: verifyData, error: verifyError } = await supabase
        .from('section_video_library')
        .select('*')
        .eq('section_id', videoPickerSectionId)
        .order('order_index', { ascending: true })
      
      if (verifyError) {
        console.error('❌ Error verifying saved videos:', verifyError)
      } else {
        console.log('✅ Verified saved videos in database:', verifyData)
        if (!verifyData || verifyData.length === 0) {
          console.error('❌ CRITICAL: Videos were not saved to database!')
          alert('⚠️ Videoene ble ikke lagret i databasen. Prøv igjen.')
          return
        }
      }
      
      setSectionVideos(prev => {
        const updated = {
          ...prev,
          [videoPickerSectionId]: result.videos
        }
        console.log('✅ Updated sectionVideos state:', updated)
        return updated
      })
      
      setSectionVideoData(prev => {
        const updated = {
          ...prev,
          [videoPickerSectionId]: result.sectionVideos
        }
        console.log('✅ Updated sectionVideoData state:', updated)
        return updated
      })
      
      // Refresh data fra databasen for å sikre at alt er synkronisert
      if (refreshData) {
        console.log('🔄 Refreshing data from database...')
        await refreshData()
        console.log('✅ Data refreshed successfully')
      }
    } catch (error) {
      console.error('❌ Error saving videos:', error)
      const errorMessage = error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : 'Ukjent feil')
      alert('❌ Kunne ikke lagre videoer: ' + errorMessage)
    } finally {
      setShowVideoPicker(false)
      setVideoPickerSectionId(null)
    }
  }

  // Lagre cases til database
  const saveCaseSelection = async () => {
    const casesSection = sections.find(s => s.type === 'cases')
    if (!casesSection) return

    try {
      // Slett eksisterende koblinger
      await supabase
        .from('section_case_studies')
        .delete()
        .eq('section_id', casesSection.id)

      // Legg til nye koblinger
      if (selectedCaseIds.length > 0) {
        const inserts = selectedCaseIds.map((caseId, index) => ({
          section_id: casesSection.id,
          case_study_id: caseId,
          order_index: index
        }))

        const { error } = await supabase
          .from('section_case_studies')
          .insert(inserts)

        if (error) throw error
      }

      setShowCasePicker(false)
    } catch (error) {
      console.error('Error saving cases:', error)
      alert('❌ Kunne ikke lagre cases')
    }
  }

  // Håndter preset-valg
  const handlePresetSelect = async (preset: CollagePreset & { images: any }) => {
    // Finn example_work seksjonen
    const exampleWorkSection = sections.find(s => s.type === 'example_work')
    if (!exampleWorkSection) {
      alert('❌ Fant ikke "Eksempelarbeid"-seksjonen')
      return
    }

    try {
      // Lagre preset ID i section content
      updateSectionContent(exampleWorkSection.id, 'presetId', preset.id)
      
      // Konverter collage images til array for lagring
      const imageArray = [
        preset.images.pos1,
        preset.images.pos2,
        preset.images.pos3,
        preset.images.pos4,
        preset.images.pos5
      ].filter(Boolean) as Image[]

      // Lagre bildene i section_images med position
      if (imageArray.length > 0) {
        const imageIds = imageArray.map(img => img.id)
        console.log('💾 Saving collage images for preset:', preset.id, 'imageIds:', imageIds)
        
        const result = await saveSectionImages(exampleWorkSection.id, imageIds)
        console.log('✅ Collage images saved:', result)
        
        // Oppdater state
        setSelectedPreset(preset)
        setCollageImages(preset.images)
        
        // Oppdater sectionImages state
        setSectionImages(prev => ({
          ...prev,
          [exampleWorkSection.id]: imageArray
        }))
        
        // Refresh data for å sikre synkronisering
        if (refreshData) {
          await refreshData()
        }
      }
      
      setShowPresetPicker(false)
    } catch (error) {
      console.error('❌ Error saving preset:', error)
      alert('❌ Kunne ikke lagre bildesett: ' + (error instanceof Error ? error.message : 'Ukjent feil'))
    }
  }

  return {
    updateSection,
    updateSectionContent,
    addQuoteSection,
    handleMoveSection,
    toggleCaseSelection,
    toggleTeamSelection,
    saveTeamSelection,
    handleImageSelect,
    handleVideoSelect,
    saveCaseSelection,
    handlePresetSelect
  }
}



