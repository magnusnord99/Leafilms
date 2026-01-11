'use client'

import { ImagePickerModal, CollagePresetPickerModal, TeamPickerModal, CasePickerModal } from '@/components/modals'
import { Section, CollagePreset, Image } from '@/lib/types'

type EditProjectModalsProps = {
  showImagePicker: boolean
  setShowImagePicker: (show: boolean) => void
  imagePickerSectionId: string | null
  setImagePickerSectionId: (id: string | null) => void
  sectionImages: Record<string, Image[]>
  sections: Section[]
  onImageSelect: (imageIds: string[]) => Promise<void>
  
  showCasePicker: boolean
  setShowCasePicker: (show: boolean) => void
  allCases: any[]
  selectedCaseIds: string[]
  onToggleCaseSelection: (caseId: string) => void
  onSaveCaseSelection: () => Promise<void>
  
  showTeamPicker: boolean
  setShowTeamPicker: (show: boolean) => void
  allTeamMembers: any[]
  selectedTeamMemberIds: string[]
  onToggleTeamSelection: (teamMemberId: string) => void
  onSaveTeamSelection: () => Promise<void>
  
  showPresetPicker: boolean
  setShowPresetPicker: (show: boolean) => void
  selectedPreset: CollagePreset | null
  onPresetSelect: (preset: CollagePreset & { images: any }) => Promise<void>
}

export function EditProjectModals({
  showImagePicker,
  setShowImagePicker,
  imagePickerSectionId,
  setImagePickerSectionId,
  sectionImages,
  sections,
  onImageSelect,
  showCasePicker,
  setShowCasePicker,
  allCases,
  selectedCaseIds,
  onToggleCaseSelection,
  onSaveCaseSelection,
  showTeamPicker,
  setShowTeamPicker,
  allTeamMembers,
  selectedTeamMemberIds,
  onToggleTeamSelection,
  onSaveTeamSelection,
  showPresetPicker,
  setShowPresetPicker,
  selectedPreset,
  onPresetSelect
}: EditProjectModalsProps) {
  return (
    <>
      {/* Team Picker Modal */}
      <TeamPickerModal
        isOpen={showTeamPicker}
        onClose={() => setShowTeamPicker(false)}
        allTeamMembers={allTeamMembers}
        selectedTeamMemberIds={selectedTeamMemberIds}
        onToggleSelection={onToggleTeamSelection}
        onSave={onSaveTeamSelection}
      />

      {/* Case Picker Modal */}
      <CasePickerModal
        isOpen={showCasePicker}
        onClose={() => setShowCasePicker(false)}
        allCases={allCases}
        selectedCaseIds={selectedCaseIds}
        onToggleSelection={onToggleCaseSelection}
        onSave={onSaveCaseSelection}
      />

      {/* Image Picker Modal */}
      <ImagePickerModal
        isOpen={showImagePicker}
        onClose={() => {
          setShowImagePicker(false)
          setImagePickerSectionId(null)
        }}
        onSelect={onImageSelect}
        selectedImageIds={imagePickerSectionId ? sectionImages[imagePickerSectionId]?.map(img => img.id) || [] : []}
        maxSelection={
          imagePickerSectionId 
            ? (() => {
                const section = sections.find(s => s.id === imagePickerSectionId)
                // Team og example_work kan ha flere bilder, resten skal ha 1
                return section?.type === 'team' || section?.type === 'example_work' ? undefined : 1
              })()
            : undefined
        }
      />

      {/* Collage Preset Picker Modal */}
      <CollagePresetPickerModal
        isOpen={showPresetPicker}
        onClose={() => setShowPresetPicker(false)}
        onSelect={onPresetSelect}
        selectedPresetId={selectedPreset?.id || null}
      />
    </>
  )
}

