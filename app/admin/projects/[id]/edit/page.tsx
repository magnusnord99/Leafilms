'use client'

import { use, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Section, CollagePreset, Image } from '@/lib/types'
import { Button, Input, Textarea, Card, Badge, Heading, Text, ImagePickerModal, DeliverableGrid, CollagePresetPickerModal } from '@/components/ui'
import { HeroPreview } from '@/components/preview/HeroPreview'
import { SectionPreview } from '@/components/preview/SectionPreview'
import { useProjectData } from './hooks/useProjectData'
import { useScrollAnimations } from './hooks/useScrollAnimations'
import { useSectionImages } from './hooks/useSectionImages'
import { useAutoSave } from './hooks/useAutoSave'
import { usePublishing } from './hooks/usePublishing'
import { useAIGeneration } from './hooks/useAIGeneration'
import { saveSectionImages } from './services/imageService'
import {
  HeroSection,
  ConceptSection,
  GoalSection,
  DeliverablesSection,
  TimelineSection,
  ContactSection,
  CasesSection,
  MoodboardSection,
  TeamSection,
  ExampleWorkSection,
  QuoteSection
} from './components'

type Props = {
  params: Promise<{ id: string }>
}

export default function EditProject({ params }: Props) {
  const router = useRouter()
  const { id } = use(params)
  const [saving, setSaving] = useState(false)
  const [showCasePicker, setShowCasePicker] = useState(false)
  const [showTeamPicker, setShowTeamPicker] = useState(false)
  const [showMobilePreview, setShowMobilePreview] = useState(false)
  const [editMode, setEditMode] = useState(true)
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [imagePickerSectionId, setImagePickerSectionId] = useState<string | null>(null)
  const [aiSettings, setAiSettings] = useState({
    projectType: '',
    medium: '',
    targetAudience: ''
  })
  
  // Collage state for ExampleWorkSection (5 bilder)
  const [collageImages, setCollageImages] = useState<{
    pos1: any | null
    pos2: any | null
    pos3: any | null
    pos4: any | null
    pos5: any | null
  }>({ pos1: null, pos2: null, pos3: null, pos4: null, pos5: null })
  const [selectedPreset, setSelectedPreset] = useState<CollagePreset | null>(null)
  const [showPresetPicker, setShowPresetPicker] = useState(false)
  const [collageImagePosition, setCollageImagePosition] = useState<string | null>(null)

  // Hooks
  const {
    loading,
    project,
    setProject,
    sections,
    setSections,
    shareLink,
    setShareLink,
    allCases,
    selectedCaseIds,
    setSelectedCaseIds,
    selectedCases,
    allTeamMembers,
    selectedTeamMemberIds,
    setSelectedTeamMemberIds,
    sectionImages,
    setSectionImages,
    sectionImageData,
    setSectionImageData,
    refreshData
  } = useProjectData(id)

  const {
    goalSectionProgress,
    goalSectionRef,
    timelineSectionProgress,
    timelineSectionRef,
    conceptSectionProgress,
    conceptSectionRef
  } = useScrollAnimations(editMode)

  const {
    editingImageSectionId,
    setEditingImageSectionId,
    imagePosition,
    setImagePosition,
    getBackgroundStyle,
    saveBackgroundPosition
  } = useSectionImages(sectionImages, setSectionImages, sectionImageData, setSectionImageData)

  const casesSection = sections.find(s => s.type === 'cases')
  const teamSection = sections.find(s => s.type === 'team')
  const { handleSave: handleSaveBase, autoSave } = useAutoSave(
    sections,
    editMode,
    id,
    casesSection?.id,
    selectedCaseIds,
    teamSection?.id,
    selectedTeamMemberIds
  )

  const handleSave = async (showAlert = false) => {
    setSaving(true)
    try {
      await handleSaveBase(showAlert)
    } finally {
      setSaving(false)
    }
  }

  const { publishing, togglePublish } = usePublishing(
    project,
    setProject,
    shareLink,
    setShareLink,
    id
  )

  // Last inn collage-bilder når prosjektet er lastet
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
        const newCollageImages: any = {
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
  }, [id, sections, sectionImages])

  // Oppdater seksjon i state
  const updateSection = (sectionId: string, field: string, value: any) => {
    setSections(sections.map(s => 
      s.id === sectionId 
        ? { ...s, [field]: value }
        : s
    ))
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

  const { generating, handleGenerateAI } = useAIGeneration(
    aiSettings,
    updateSectionContent
  )

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
      console.log('💾 [handleImageSelect] Number of images:', imageIds.length)
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
      console.log('🔄 Refreshing data from database...')
      await refreshData()
      console.log('✅ Data refreshed successfully')
    } catch (error) {
      console.error('❌ Error saving images:', error)
      const errorMessage = error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : 'Ukjent feil')
      alert('❌ Kunne ikke lagre bilder: ' + errorMessage)
    } finally {
      setShowImagePicker(false)
      setImagePickerSectionId(null)
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
      // eslint-disable-next-line no-console
      console.error('Error saving cases:', error)
      alert('❌ Kunne ikke lagre cases')
    }
  }


  // Seksjonstitler
  const getSectionTitle = (type: string) => {
    const titles: Record<string, string> = {
      hero: 'Hero',
      goal: 'Mål',
      concept: 'Konsept',
      cases: 'Tidligere arbeid',
      moodboard: 'Moodboard',
      timeline: 'Tidslinje',
      deliverables: 'Leveranser',
      contact: 'Kontakt',
      team: 'Team',
      example_work: 'Eksempelarbeid',
      quote: 'Pristilbud'
    }
    return titles[type] || type
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-gray-400">Laster prosjekt...</p>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl mb-4">❌ Prosjekt ikke funnet</p>
          <button
            onClick={() => router.push('/admin')}
            className="text-gray-400 hover:text-white"
          >
            ← Tilbake til admin
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-dark">
      {/* Top Bar */}
      <div className="sticky top-0 bg-background border-b border-zinc-300 p-4 z-40">
        <div className="max-w-[2500px] mx-auto flex items-center justify-between">l
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => router.push('/admin')}
              size="sm"
            >
              ← Tilbake
            </Button>
            <div>
              <Heading as="h1" size="sm" className="mb-0">{project.title}</Heading>
              {project.client_name && (
                <Text variant="muted" className="text-xs">Kunde: {project.client_name}</Text>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Legg til Pristilbud-seksjon */}
            {editMode && !sections.find(s => s.type === 'quote') && (
              <Button
                onClick={addQuoteSection}
                variant="secondary"
                size="sm"
              >
                + Legg til Pristilbud
              </Button>
            )}
            {/* Rediger-modus Toggle */}
            <Button
              onClick={() => setEditMode(!editMode)}
              variant={editMode ? 'primary' : 'secondary'}
              size="sm"
            >
              {editMode ? ' Rediger-modus' : 'Visning-modus'}
            </Button>
            <Badge variant={project.status as 'draft' | 'published' | 'archived'}>
              {project.status === 'published' ? '🟢 Publisert' : '🟡 Utkast'}
            </Badge>
            <Button
              onClick={() => setShowMobilePreview(!showMobilePreview)}
              variant="ghost"
              size="sm"
              className="lg:hidden"
            >
              {showMobilePreview ? '✏️ Rediger' : '👁️ Preview'}
            </Button>
            <Button
              onClick={() => handleSave(true)}
              disabled={saving}
              variant="secondary"
              size="sm"
            >
              {saving ? 'Lagrer...' : '💾 Lagre'}
            </Button>
            <Button
              onClick={togglePublish}
              disabled={publishing}
              variant={project?.status === 'published' ? 'danger' : 'primary'}
              size="sm"
            >
              {publishing 
                ? (project?.status === 'published' ? 'Avpubliserer...' : 'Publiserer...') 
                : (project?.status === 'published' ? '🔴 Avpubliser' : '🚀 Publiser')}
            </Button>
          </div>
        </div>
      </div>

      {/* Inline Editing Layout */}
      <div className="min-h-screen bg-background">
        <div className="w-full">

        {/* Hero Section */}
        {sections.find(s => s.type === 'hero') && (() => {
          const heroSection = sections.find(s => s.type === 'hero')!
          return (
            <HeroSection
              section={heroSection}
              project={project!}
              editMode={editMode}
              sectionImages={sectionImages}
              sectionImageData={sectionImageData}
              editingImageSectionId={editingImageSectionId}
              imagePosition={imagePosition}
              getBackgroundStyle={getBackgroundStyle}
              updateSectionContent={updateSectionContent}
              saveBackgroundPosition={saveBackgroundPosition}
              setImagePosition={setImagePosition}
              onImageClick={() => {
                if (editMode && !sectionImages[heroSection.id]?.[0]) {
                  setImagePickerSectionId(heroSection.id)
                  setShowImagePicker(true)
                }
              }}
              onEditPositionClick={(e) => {
                e.stopPropagation()
                setEditingImageSectionId(editingImageSectionId === heroSection.id ? null : heroSection.id)
              }}
              onImagePickerOpen={() => {
                setImagePickerSectionId(heroSection.id)
                setShowImagePicker(true)
              }}
            />
          )
        })()}

        {/* Sections - Inline Editing */}
        <div className="relative">
          {sections
            .filter(s => s.type !== 'hero')
            .sort((a, b) => {
              // Sorter kontakt-seksjonen alltid til slutt
              if (a.type === 'contact' && b.type !== 'contact') return 1
              if (a.type !== 'contact' && b.type === 'contact') return -1
              // Ellers bruk order_index
              return a.order_index - b.order_index
            })
            .map((section, index) => {
              if (!section.visible) return null
              
              return (
                <section
                  key={section.id}
                  className={`${section.type === 'concept' ? 'min-h-screen flex flex-col items-center justify-center px-0' : 'py-section px-2 md:px-4'} ${section.type === 'cases' ? 'bg-transparent' : 'bg-background'} relative`}
                >
                  {/* Edit Controls - Absolute positioned in top-right corner */}
                  {editMode && (
                    <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
                      {/* Rekkefølge-kontroller */}
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => handleMoveSection(section.id, 'up')}
                          disabled={index === 0}
                          className="w-8 h-8 rounded-full bg-background-elevated hover:bg-background-elevated/80 border border-border flex items-center justify-center text-dark text-sm transition disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Flytt opp"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => handleMoveSection(section.id, 'down')}
                          disabled={index === sections.filter(s => s.type !== 'hero' && s.visible).length - 1}
                          className="w-8 h-8 rounded-full bg-background-elevated hover:bg-background-elevated/80 border border-border flex items-center justify-center text-dark text-sm transition disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Flytt ned"
                        >
                          ↓
                        </button>
                      </div>
                      {['goal', 'concept'].includes(section.type) && (
                        <button
                          type="button"
                          onClick={() => handleGenerateAI(section.id, section.type)}
                          disabled={generating === section.id}
                          className="w-8 h-8 rounded-full bg-background-elevated hover:bg-background-elevated/80 border border-border flex items-center justify-center text-dark text-sm transition disabled:opacity-50"
                          title="Generer med AI"
                        >
                          {generating === section.id ? '⏳' : '✨'}
                        </button>
                      )}
                      <button
                        onClick={() => updateSection(section.id, 'visible', false)}
                        className="w-8 h-8 rounded-full bg-background-elevated hover:bg-background-elevated/80 border border-border flex items-center justify-center text-dark text-sm transition"
                        title="Skjul seksjon"
                      >
                        👁️
                      </button>
                    </div>
                  )}
                  
                  <div className={section.type === 'team' || section.type === 'concept' || section.type === 'example_work' || section.type === 'quote' ? 'w-full' : 'max-w-7xl mx-auto'}>  
                    {/* Concept Section */}
                    {section.type === 'concept' && (
                      <ConceptSection
                        section={section}
                        editMode={editMode}
                        sectionImages={sectionImages}
                        sectionImageData={sectionImageData}
                        editingImageSectionId={editingImageSectionId}
                        imagePosition={imagePosition}
                        conceptSectionProgress={conceptSectionProgress}
                        conceptSectionRef={conceptSectionRef}
                        getBackgroundStyle={getBackgroundStyle}
                        getSectionTitle={getSectionTitle}
                        updateSectionContent={updateSectionContent}
                        saveBackgroundPosition={saveBackgroundPosition}
                        setImagePosition={setImagePosition}
                        onImageClick={() => {
                          if (editMode && !sectionImages[section.id]?.[0]) {
                            setImagePickerSectionId(section.id)
                            setShowImagePicker(true)
                          }
                        }}
                        onEditPositionClick={(e) => {
                          e.stopPropagation()
                          setEditingImageSectionId(editingImageSectionId === section.id ? null : section.id)
                        }}
                        onImagePickerOpen={() => {
                          setImagePickerSectionId(section.id)
                          setShowImagePicker(true)
                        }}
                      />
                    )}

                    {/* Goal Section */}
                    {section.type === 'goal' && (
                      <GoalSection
                        section={section}
                        editMode={editMode}
                        sectionImages={sectionImages}
                        sectionImageData={sectionImageData}
                        editingImageSectionId={editingImageSectionId}
                        imagePosition={imagePosition}
                        goalSectionProgress={goalSectionProgress}
                        goalSectionRef={goalSectionRef}
                        getBackgroundStyle={getBackgroundStyle}
                        getSectionTitle={getSectionTitle}
                        updateSectionContent={updateSectionContent}
                        saveBackgroundPosition={saveBackgroundPosition}
                        setImagePosition={setImagePosition}
                        onImageClick={() => {
                          if (editMode && !sectionImages[section.id]?.[0]) {
                            setImagePickerSectionId(section.id)
                            setShowImagePicker(true)
                          }
                        }}
                        onEditPositionClick={(e) => {
                          e.stopPropagation()
                          setEditingImageSectionId(editingImageSectionId === section.id ? null : section.id)
                        }}
                        onImagePickerOpen={() => {
                          setImagePickerSectionId(section.id)
                          setShowImagePicker(true)
                        }}
                      />
                    )}
                    {/* Deliverables Section */}
                    {section.type === 'deliverables' && (
                      <DeliverablesSection
                        section={section}
                        editMode={editMode}
                        sectionImages={sectionImages}
                        sectionImageData={sectionImageData}
                        editingImageSectionId={editingImageSectionId}
                        imagePosition={imagePosition}
                        getBackgroundStyle={getBackgroundStyle}
                        getSectionTitle={getSectionTitle}
                        updateSectionContent={updateSectionContent}
                        saveBackgroundPosition={saveBackgroundPosition}
                        setImagePosition={setImagePosition}
                        onImageClick={() => {
                          if (editMode && !sectionImages[section.id]?.[0]) {
                            setImagePickerSectionId(section.id)
                            setShowImagePicker(true)
                          }
                        }}
                        onEditPositionClick={(e) => {
                          e.stopPropagation()
                          setEditingImageSectionId(editingImageSectionId === section.id ? null : section.id)
                        }}
                        onImagePickerOpen={() => {
                          setImagePickerSectionId(section.id)
                          setShowImagePicker(true)
                        }}
                      />
                    )}

                    {/* Timeline Section */}
                    {section.type === 'timeline' && (
                      <TimelineSection
                        section={section}
                        editMode={editMode}
                        timelineSectionProgress={timelineSectionProgress}
                        timelineSectionRef={timelineSectionRef}
                        getSectionTitle={getSectionTitle}
                        updateSectionContent={updateSectionContent}
                      />
                    )}

                    {/* Contact Section */}
                    {section.type === 'contact' && (
                      <ContactSection
                        section={section}
                        editMode={editMode}
                        updateSectionContent={updateSectionContent}
                      />
                    )}

                    {/* Quote Section */}
                    {section.type === 'quote' && (
                      <QuoteSection
                        section={section}
                        project={project}
                        editMode={editMode}
                        updateSectionContent={updateSectionContent}
                      />
                    )}

                    {/* Cases Section */}
                    {section.type === 'cases' && (
                      <CasesSection
                        section={section}
                        editMode={editMode}
                        selectedCaseIds={selectedCaseIds}
                        allCases={allCases}
                        updateSectionContent={updateSectionContent}
                        onCasePickerOpen={() => setShowCasePicker(true)}
                      />
                    )}

                    {/* Moodboard Section */}
                    {section.type === 'moodboard' && (
                      <MoodboardSection
                        section={section}
                        editMode={editMode}
                        updateSectionContent={updateSectionContent}
                      />
                    )}

                    {/* Team Section */}
                    {section.type === 'team' && (
                      <TeamSection
                        section={section}
                        editMode={editMode}
                        allTeamMembers={allTeamMembers}
                        selectedTeamMemberIds={selectedTeamMemberIds}
                        sectionImages={sectionImages}
                        updateSectionContent={updateSectionContent}
                        onTeamPickerOpen={() => setShowTeamPicker(true)}
                        onGalleryImageClick={() => {
                          if (editMode) {
                            setImagePickerSectionId(section.id)
                            setShowImagePicker(true)
                          }
                        }}
                      />
                    )}

                    {/* Example Work Section */}
                    {section.type === 'example_work' && (
                      <ExampleWorkSection
                        section={section}
                        editMode={editMode}
                        collageImages={collageImages}
                        selectedPreset={selectedPreset}
                        updateSectionContent={updateSectionContent}
                        onImageClick={(position) => {
                          setCollageImagePosition(position)
                          setImagePickerSectionId(section.id)
                          setShowImagePicker(true)
                        }}
                        onOpenPresetPicker={() => setShowPresetPicker(true)}
                      />
                    )}
                  </div>
                </section>
              )
            })}
        </div>

        {/* Skjulte seksjoner (kun i edit mode) */}
        {editMode && sections.filter(s => !s.visible && s.type !== 'hero').length > 0 && (
          <section className="py-section px-8 border-t border-zinc-300 bg-background">
            <div className="max-w-5xl mx-auto">
              <Heading as="h2" size="lg" className="mb-6">
                Skjulte seksjoner
              </Heading>
              <div className="space-y-4">
                {sections
                  .filter(s => !s.visible && s.type !== 'hero')
                  .map((section) => (
                    <Card key={section.id} className="bg-zinc-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <Heading as="h3" size="sm" className="mb-2 !text-white">
                            {getSectionTitle(section.type)}
                          </Heading>
                        </div>
                        <Button
                          onClick={() => updateSection(section.id, 'visible', true)}
                          variant="primary"
                          size="sm"
                        >
                          Vis
                        </Button>
                      </div>
                    </Card>
                  ))}
              </div>
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="py-12 px-8 border-t border-zinc-300 bg-background">
          <div className="max-w-5xl mx-auto text-center">
            <Text variant="muted">
              © {new Date().getFullYear()} Lea Films. All rights reserved.
            </Text>
          </div>
        </footer>
        
        {/* Share Link */}
        {shareLink && (
          <Card className="mb-6 bg-green-500/10 border-green-500/30">
            <div className="flex items-center justify-between">
              <div>
                <Text variant="small" className="text-green-400 mb-2">Prosjekt publisert!</Text>
                <Text variant="small" className="text-gray-300 font-mono break-all text-xs">{shareLink}</Text>
              </div>
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(shareLink)
                }}
                variant="secondary"
                size="sm"
              >
                Kopier
              </Button>
            </div>
          </Card>
        )}
        </div>
      </div>

        {/* Team Picker Modal */}
        {showTeamPicker && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-8 z-50">
            <Card className="max-w-5xl w-full max-h-[80vh] overflow-y-auto">
              <div className="mb-6">
                <Heading as="h2" size="md" className="mb-2">Velg Team-medlemmer</Heading>
                <Text variant="muted">Klikk for å velge/fjerne. Vises i "Team"-seksjonen.</Text>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {allTeamMembers.map((teamMember) => {
                  const isSelected = selectedTeamMemberIds.includes(teamMember.id)
                  const profileImageUrl = teamMember.profile_image_path
                    ? supabase.storage.from('assets').getPublicUrl(teamMember.profile_image_path).data.publicUrl
                    : null
                  
                  return (
                    <div
                      key={teamMember.id}
                      onClick={() => toggleTeamSelection(teamMember.id)}
                      className={`cursor-pointer rounded-lg overflow-hidden transition ${
                        isSelected 
                          ? 'ring-2 ring-green-500' 
                          : 'hover:ring-2 hover:ring-zinc-600'
                      }`}
                    >
                      <div className="bg-zinc-900 p-4 flex items-center gap-4">
                        {/* Profile Image */}
                        <div className="flex-shrink-0">
                          <div className="w-16 h-16 rounded-full bg-zinc-800 overflow-hidden flex items-center justify-center">
                            {profileImageUrl ? (
                              <img
                                src={profileImageUrl}
                                alt={teamMember.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Text variant="muted" className="text-2xl">👤</Text>
                            )}
                          </div>
                        </div>
                        
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <Heading as="h4" size="sm" className="mb-1">
                            {teamMember.name}
                          </Heading>
                          <Text variant="small" className="text-gray-400">
                            {teamMember.role}
                          </Text>
                          {teamMember.bio && (
                            <Text variant="small" className="line-clamp-2 text-xs mt-1 text-gray-500">
                              {teamMember.bio}
                            </Text>
                          )}
                        </div>

                        {isSelected && (
                          <div className="flex-shrink-0 bg-green-500 text-white text-xs px-2 py-1 rounded">
                            ✓
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {allTeamMembers.length === 0 && (
                <div className="text-center py-12">
                  <Text variant="body" className="mb-4">
                    Ingen team-medlemmer i biblioteket ennå
                  </Text>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => router.push('/admin/team/new')}
                  >
                    Opprett første team-medlem
                  </Button>
                </div>
              )}

              <div className="flex gap-4 pt-6 border-t border-zinc-800">
                <Button
                  type="button"
                  onClick={() => setShowTeamPicker(false)}
                  variant="secondary"
                  className="flex-1"
                >
                  Avbryt
                </Button>
                <Button
                  type="button"
                  onClick={saveTeamSelection}
                  variant="primary"
                  className="flex-1"
                  disabled={selectedTeamMemberIds.length === 0}
                >
                  Bruk valgte ({selectedTeamMemberIds.length})
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Case Picker Modal */}
        {showCasePicker && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-8 z-50">
            <Card className="max-w-5xl w-full max-h-[80vh] overflow-y-auto">
              <div className="mb-6">
                <Heading as="h2" size="md" className="mb-2">Velg Case Studies (maks 4)</Heading>
                <Text variant="muted">Klikk for å velge/fjerne. Vises i "Tidligere arbeid"-seksjonen.</Text>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                {allCases.map((caseStudy) => {
                  const isSelected = selectedCaseIds.includes(caseStudy.id)
                  return (
                    <div
                      key={caseStudy.id}
                      onClick={() => toggleCaseSelection(caseStudy.id)}
                      className={`cursor-pointer rounded-lg overflow-hidden transition ${
                        isSelected 
                          ? 'ring-2 ring-green-500' 
                          : 'hover:ring-2 hover:ring-zinc-600'
                      }`}
                    >
                      {/* Thumbnail */}
                      <div className="aspect-video bg-zinc-800 flex items-center justify-center relative">
                        {caseStudy.thumbnail_path ? (
                          <img
                            src={caseStudy.thumbnail_path}
                            alt={caseStudy.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Text variant="muted">🎬</Text>
                        )}
                        {isSelected && (
                          <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
                            ✓ Valgt
                          </div>
                        )}
                      </div>
                      
                      {/* Info */}
                      <div className="bg-zinc-900 p-3">
                        <Heading as="h4" size="sm" className="text-sm mb-1">
                          {caseStudy.title}
                        </Heading>
                        <Text variant="small" className="line-clamp-2 text-xs">
                          {caseStudy.description}
                        </Text>
                      </div>
                    </div>
                  )
                })}
              </div>

              {allCases.length === 0 && (
                <div className="text-center py-12">
                  <Text variant="body" className="mb-4">
                    Ingen case studies i biblioteket ennå
                  </Text>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => router.push('/admin/cases/new')}
                  >
                    Opprett første case
                  </Button>
                </div>
              )}

              <div className="flex gap-4 pt-6 border-t border-zinc-800">
                <Button
                  type="button"
                  onClick={() => setShowCasePicker(false)}
                  variant="secondary"
                  className="flex-1"
                >
                  Avbryt
                </Button>
                <Button
                  type="button"
                  onClick={saveCaseSelection}
                  variant="primary"
                  className="flex-1"
                  disabled={selectedCaseIds.length === 0}
                >
                  Bruk valgte ({selectedCaseIds.length})
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Image Picker Modal */}
        <ImagePickerModal
          isOpen={showImagePicker}
          onClose={() => {
            setShowImagePicker(false)
            setImagePickerSectionId(null)
          }}
          onSelect={handleImageSelect}
          selectedImageIds={imagePickerSectionId ? sectionImages[imagePickerSectionId]?.map(img => img.id) || [] : []}
        />

        {/* Collage Preset Picker Modal */}
        <CollagePresetPickerModal
          isOpen={showPresetPicker}
          onClose={() => setShowPresetPicker(false)}
          onSelect={async (preset) => {
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
          }}
          selectedPresetId={selectedPreset?.id || null}
        />
    </div>
  )
}

