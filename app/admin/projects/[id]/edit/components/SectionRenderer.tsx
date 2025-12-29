'use client'

import { Section, Image } from '@/lib/types'
import {
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
} from './index'

type SectionRendererProps = {
  section: Section
  index: number
  totalVisible: number
  editMode: boolean
  sectionImages: Record<string, Image[]>
  sectionImageData: Record<string, any[]>
  editingImageSectionId: string | null
  imagePosition: Record<string, { x: number; y: number; zoom: number | null }>
  goalSectionProgress: number
  goalSectionRef: React.RefObject<HTMLDivElement | null>
  timelineSectionProgress: number
  timelineSectionRef: React.RefObject<HTMLDivElement | null>
  conceptSectionProgress: number
  conceptSectionRef: React.RefObject<HTMLDivElement | null>
  getBackgroundStyle: (sectionId: string, imageIndex?: number) => React.CSSProperties
  getSectionTitle: (type: string) => string
  updateSectionContent: (sectionId: string, key: string, value: any) => void
  saveBackgroundPosition: (sectionId: string, imageIndex: number, positionX: number, positionY: number, zoom: number | null) => Promise<void>
  setImagePosition: React.Dispatch<React.SetStateAction<Record<string, { x: number; y: number; zoom: number | null }>>>
  setEditingImageSectionId: (id: string | null) => void
  setImagePickerSectionId: (id: string | null) => void
  setShowImagePicker: (show: boolean) => void
  handleMoveSection: (sectionId: string, direction: 'up' | 'down') => void
  updateSection: (sectionId: string, field: string, value: any) => void
  handleGenerateAI: (sectionId: string, sectionType: string) => void
  generating: string | null
  allCases: any[]
  selectedCaseIds: string[]
  onCasePickerOpen: () => void
  allTeamMembers: any[]
  selectedTeamMemberIds: string[]
  onTeamPickerOpen: () => void
  collageImages: {
    pos1: any | null
    pos2: any | null
    pos3: any | null
    pos4: any | null
    pos5: any | null
  }
  selectedPreset: any
  onImageClick: (position?: string) => void
  onOpenPresetPicker: () => void
  project: any
}

export function SectionRenderer({
  section,
  index,
  totalVisible,
  editMode,
  sectionImages,
  sectionImageData,
  editingImageSectionId,
  imagePosition,
  goalSectionProgress,
  goalSectionRef,
  timelineSectionProgress,
  timelineSectionRef,
  conceptSectionProgress,
  conceptSectionRef,
  getBackgroundStyle,
  getSectionTitle,
  updateSectionContent,
  saveBackgroundPosition,
  setImagePosition,
  setEditingImageSectionId,
  setImagePickerSectionId,
  setShowImagePicker,
  handleMoveSection,
  updateSection,
  handleGenerateAI,
  generating,
  allCases,
  selectedCaseIds,
  onCasePickerOpen,
  allTeamMembers,
  selectedTeamMemberIds,
  onTeamPickerOpen,
  collageImages,
  selectedPreset,
  onImageClick,
  onOpenPresetPicker,
  project
}: SectionRendererProps) {
  const handleImageClick = (sectionId: string) => {
    if (editMode && !sectionImages[sectionId]?.[0]) {
      setImagePickerSectionId(sectionId)
      setShowImagePicker(true)
    }
  }

  const handleEditPositionClick = (e: React.MouseEvent, sectionId: string) => {
    e.stopPropagation()
    setEditingImageSectionId(editingImageSectionId === sectionId ? null : sectionId)
  }

  const handleImagePickerOpen = (sectionId: string) => {
    setImagePickerSectionId(sectionId)
    setShowImagePicker(true)
  }

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
              disabled={index === totalVisible - 1}
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
            onImageClick={() => handleImageClick(section.id)}
            onEditPositionClick={(e) => handleEditPositionClick(e, section.id)}
            onImagePickerOpen={() => handleImagePickerOpen(section.id)}
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
            onImageClick={() => handleImageClick(section.id)}
            onEditPositionClick={(e) => handleEditPositionClick(e, section.id)}
            onImagePickerOpen={() => handleImagePickerOpen(section.id)}
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
            onImageClick={() => handleImageClick(section.id)}
            onEditPositionClick={(e) => handleEditPositionClick(e, section.id)}
            onImagePickerOpen={() => handleImagePickerOpen(section.id)}
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
            onCasePickerOpen={onCasePickerOpen}
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
            onTeamPickerOpen={onTeamPickerOpen}
            onGalleryImageClick={() => {
              if (editMode) {
                handleImagePickerOpen(section.id)
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
            onImageClick={onImageClick}
            onOpenPresetPicker={onOpenPresetPicker}
          />
        )}
      </div>
    </section>
  )
}

