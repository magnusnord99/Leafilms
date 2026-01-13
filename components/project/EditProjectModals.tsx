'use client'

import { ImagePickerModal, VideoPickerModal, CollagePresetPickerModal, TeamPickerModal, CasePickerModal } from '@/components/modals'
import { Section, CollagePreset, Image, VideoLibrary } from '@/lib/types'

type EditProjectModalsProps = {
  showImagePicker: boolean
  setShowImagePicker: (show: boolean) => void
  imagePickerSectionId: string | null
  setImagePickerSectionId: (id: string | null) => void
  sectionImages: Record<string, Image[]>
  sectionVideos?: Record<string, VideoLibrary[]>
  sections: Section[]
  onImageSelect: (imageIds: string[]) => Promise<void>
  onVideoSelect?: (videoIds: string[]) => Promise<void>
  
  showVideoPicker?: boolean
  setShowVideoPicker?: (show: boolean) => void
  videoPickerSectionId?: string | null
  setVideoPickerSectionId?: (id: string | null) => void
  
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
  sectionVideos = {},
  sections,
  onImageSelect,
  onVideoSelect,
  showVideoPicker = false,
  setShowVideoPicker,
  videoPickerSectionId = null,
  setVideoPickerSectionId,
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

      {/* Video Picker Modal */}
      {onVideoSelect && setShowVideoPicker && setVideoPickerSectionId && (
        <VideoPickerModal
          isOpen={showVideoPicker}
          onClose={() => {
            setShowVideoPicker(false)
            setVideoPickerSectionId(null)
          }}
          onSelect={onVideoSelect}
          selectedVideoIds={videoPickerSectionId ? sectionVideos[videoPickerSectionId]?.map(vid => vid.id) || [] : []}
          maxSelection={1}
          category="hero"
        />
      )}

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

