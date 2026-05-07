'use client'

import { use, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Section, CollagePreset } from '@/lib/types'
import { Button, Card, Heading, Text } from '@/components/ui'
import { HeroPreview } from '@/components/preview/HeroPreview'
import { SectionPreview } from '@/components/preview/SectionPreview'
import { useProjectData } from '@/hooks/project/useProjectData'
import { useScrollAnimations } from '@/hooks/useScrollAnimations'
import { useSectionImages } from '@/hooks/project/useSectionImages'
import { useAutoSave } from '@/hooks/project/useAutoSave'
import { usePublishing } from '@/hooks/project/usePublishing'
import { useAIGeneration } from '@/hooks/project/useAIGeneration'
import { useSectionHandlers } from '@/hooks/project/useSectionHandlers'
import { useCollageImages } from '@/hooks/project/useCollageImages'
import {
  EditProjectTopBar,
  SectionRenderer,
  EditProjectModals
} from '@/components/project'
import { HeroSection } from '@/components/sections'

type Props = {
  params: Promise<{ id: string }>
}

export default function EditProject({ params }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { id } = use(params)
  const [saving, setSaving] = useState(false)
  const [showCasePicker, setShowCasePicker] = useState(false)
  const [showTeamPicker, setShowTeamPicker] = useState(false)
  const [showMobilePreview, setShowMobilePreview] = useState(false)
  const [editMode, setEditMode] = useState(true)
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [showVideoPicker, setShowVideoPicker] = useState(false)
  const [videoPickerSectionId, setVideoPickerSectionId] = useState<string | null>(null)
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
  const [duplicating, setDuplicating] = useState(false)
  const [translating, setTranslating] = useState(false)

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
    sectionVideos,
    setSectionVideos,
    sectionVideoData,
    setSectionVideoData,
    refreshData
  } = useProjectData(id)

  // Refresh data hvis prosjektet nettopp ble generert
  useEffect(() => {
    if (searchParams.get('generated') === 'true') {
      console.log('[EditProject] Project was just generated, refreshing data...')
      // Vent litt for å sikre at alle database-oppdateringer er ferdig
      // Økt ventetid for å sikre at alle bilder er ferdig lagret
      const timeout = setTimeout(() => {
        console.log('[EditProject] Refreshing data after generation...')
        refreshData()
        // Fjern query parameter
        router.replace(`/admin/projects/${id}/edit`)
      }, 3000) // Økt fra 1000 til 3000ms
      return () => clearTimeout(timeout)
    }
  }, [searchParams, refreshData, router, id])

  const {
    goalSectionProgress,
    goalSectionRef,
    timelineSectionProgress,
    timelineSectionRef,
    conceptSectionProgress,
    conceptSectionRef,
    casesSectionProgress,
    casesSectionRef
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

  const handleTranslate = async () => {
    if (!project) return
    const targetLanguage = project.language === 'en' ? 'no' : 'en'
    const confirmed = confirm(
      project.language === 'en'
        ? 'Oversett hele prosjektet til norsk? Dette vil erstatte alt innhold.'
        : 'Translate the entire project to English? This will replace all content.'
    )
    if (!confirmed) return

    setTranslating(true)
    try {
      const res = await fetch('/api/translate-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id, targetLanguage })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Oversettelse feilet')
      setProject(prev => prev ? { ...prev, language: targetLanguage } : prev)
      await refreshData()
    } catch (err) {
      console.error('Translate error:', err)
      alert(err instanceof Error ? err.message : 'Oversettelse feilet')
    } finally {
      setTranslating(false)
    }
  }

  const handleDuplicateVersion = async () => {
    setDuplicating(true)
    try {
      const res = await fetch(`/api/projects/${id}/duplicate`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kunne ikke opprette ny versjon')
      router.push(`/admin/projects/${data.project.id}/edit`)
      router.refresh()
    } catch (err) {
      console.error('Duplicate error:', err)
      alert(err instanceof Error ? err.message : 'Kunne ikke opprette ny versjon')
    } finally {
      setDuplicating(false)
    }
  }

  // Use collage images hook
  useCollageImages({
    id,
    sections,
    sectionImages,
    setCollageImages,
    setSelectedPreset
  })

  // Use section handlers hook
  const {
    updateSection,
    updateSectionContent,
    addFullImageSection,
    addQuoteSection,
    addProductionScheduleSection,
    handleMoveSection,
    toggleCaseSelection,
    toggleTeamSelection,
    saveTeamSelection,
    handleImageSelect,
    handleVideoSelect,
    saveCaseSelection,
    handlePresetSelect
  } = useSectionHandlers({
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
  })

  const handleImageSelectForModal = async (imageIds: string[]) => {
    if (collageImagePosition && imagePickerSectionId) {
      if (!imageIds[0]) {
        setCollageImagePosition(null)
        return
      }
      const posIndex = parseInt(collageImagePosition.replace('pos', '')) - 1
      const currentIds = (sectionImages[imagePickerSectionId] || []).map(img => img.id)
      while (currentIds.length <= posIndex) currentIds.push(currentIds[currentIds.length - 1] || imageIds[0])
      currentIds[posIndex] = imageIds[0]
      setCollageImagePosition(null)
      await handleImageSelect(currentIds)
    } else {
      await handleImageSelect(imageIds)
    }
  }

  const { generating, handleGenerateAI } = useAIGeneration(
    aiSettings,
    updateSectionContent
  )


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
      quote: 'Pristilbud',
      full_image: 'Bildeseksjon',
      production_schedule: 'Produksjonsplan'
    }
    return titles[type] || type
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-gray-400">Laster prosjekt...</p>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
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
      <EditProjectTopBar
        project={project}
        sections={sections}
        editMode={editMode}
        saving={saving}
        publishing={publishing}
        showMobilePreview={showMobilePreview}
        shareLink={shareLink}
        translating={translating}
        onEditModeToggle={() => setEditMode(!editMode)}
        onMobilePreviewToggle={() => setShowMobilePreview(!showMobilePreview)}
        onSave={() => handleSave(true)}
        onPublish={togglePublish}
        onAddFullImageSection={addFullImageSection}
        onAddQuoteSection={addQuoteSection}
        onAddProductionScheduleSection={addProductionScheduleSection}
        onDuplicateVersion={handleDuplicateVersion}
        onTranslate={handleTranslate}
        duplicating={duplicating}
      />

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
              sectionVideos={sectionVideos}
              sectionVideoData={sectionVideoData}
              editingImageSectionId={editingImageSectionId}
              imagePosition={imagePosition}
              getBackgroundStyle={getBackgroundStyle}
              updateSectionContent={updateSectionContent}
              saveBackgroundPosition={saveBackgroundPosition}
              setImagePosition={setImagePosition}
              onImageClick={() => {
                // Dette brukes ikke lenger - video picker prioriteres alltid
                // Men beholder for bakoverkompatibilitet
              }}
              onEditPositionClick={(e) => {
                e.stopPropagation()
                setEditingImageSectionId(editingImageSectionId === heroSection.id ? null : heroSection.id)
              }}
              onImagePickerOpen={() => {
                setImagePickerSectionId(heroSection.id)
                setShowImagePicker(true)
              }}
              onVideoPickerOpen={() => {
                setVideoPickerSectionId(heroSection.id)
                setShowVideoPicker(true)
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
              
              const visibleSections = sections.filter(s => s.type !== 'hero' && s.visible)
              
              return (
                <SectionRenderer
                  key={section.id}
                  section={section}
                  index={index}
                  totalVisible={visibleSections.length}
                  editMode={editMode}
                  sectionImages={sectionImages}
                  sectionImageData={sectionImageData}
                  editingImageSectionId={editingImageSectionId}
                  imagePosition={imagePosition}
                  goalSectionProgress={goalSectionProgress}
                  goalSectionRef={goalSectionRef}
                  timelineSectionProgress={timelineSectionProgress}
                  timelineSectionRef={timelineSectionRef}
                  conceptSectionProgress={conceptSectionProgress}
                  conceptSectionRef={conceptSectionRef}
                  casesSectionProgress={casesSectionProgress}
                  casesSectionRef={casesSectionRef}
                  getBackgroundStyle={getBackgroundStyle}
                  getSectionTitle={getSectionTitle}
                  updateSectionContent={updateSectionContent}
                  saveBackgroundPosition={saveBackgroundPosition}
                  setImagePosition={setImagePosition}
                  setEditingImageSectionId={setEditingImageSectionId}
                  setImagePickerSectionId={setImagePickerSectionId}
                  setShowImagePicker={setShowImagePicker}
                  handleMoveSection={handleMoveSection}
                  updateSection={updateSection}
                  handleGenerateAI={handleGenerateAI}
                  generating={generating}
                  allCases={allCases}
                  selectedCaseIds={selectedCaseIds}
                  onCasePickerOpen={() => setShowCasePicker(true)}
                  allTeamMembers={allTeamMembers}
                  selectedTeamMemberIds={selectedTeamMemberIds}
                  onTeamPickerOpen={() => setShowTeamPicker(true)}
                  collageImages={collageImages}
                  selectedPreset={selectedPreset}
                  onImageClick={(position) => {
                    if (position) {
                      setCollageImagePosition(position)
                    }
                    setImagePickerSectionId(section.id)
                    setShowImagePicker(true)
                  }}
                  onOpenPresetPicker={() => setShowPresetPicker(true)}
                  project={project}
                />
              )
            })}
        </div>

        {/* Skjulte seksjoner (kun i edit mode) */}
        {editMode && sections.filter(s => !s.visible && s.type !== 'hero').length > 0 && (
          <section className="py-section px-8 border-t border-zinc-300 bg-background">
            <div className="max-w-5xl mx-auto">
              <Heading as="h4" className="mb-6">
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
        </div>
      </div>

        {/* Modals */}
        <EditProjectModals
          showImagePicker={showImagePicker}
          setShowImagePicker={setShowImagePicker}
          imagePickerSectionId={imagePickerSectionId}
          setImagePickerSectionId={setImagePickerSectionId}
          collageImagePosition={collageImagePosition}
          sectionImages={sectionImages}
          sectionVideos={sectionVideos}
          sections={sections}
          onImageSelect={handleImageSelectForModal}
          onVideoSelect={handleVideoSelect}
          showVideoPicker={showVideoPicker}
          setShowVideoPicker={setShowVideoPicker}
          videoPickerSectionId={videoPickerSectionId}
          setVideoPickerSectionId={setVideoPickerSectionId}
          showCasePicker={showCasePicker}
          setShowCasePicker={setShowCasePicker}
          allCases={allCases}
          selectedCaseIds={selectedCaseIds}
          onToggleCaseSelection={toggleCaseSelection}
          onSaveCaseSelection={saveCaseSelection}
          showTeamPicker={showTeamPicker}
          setShowTeamPicker={setShowTeamPicker}
          allTeamMembers={allTeamMembers}
          selectedTeamMemberIds={selectedTeamMemberIds}
          onToggleTeamSelection={toggleTeamSelection}
          onSaveTeamSelection={saveTeamSelection}
          showPresetPicker={showPresetPicker}
          setShowPresetPicker={setShowPresetPicker}
          selectedPreset={selectedPreset}
          onPresetSelect={handlePresetSelect}
        />
    </div>
  )
}

