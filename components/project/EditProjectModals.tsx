'use client'

import { ImagePickerModal, VideoPickerModal, CollagePresetPickerModal, TeamPickerModal, CasePickerModal } from '@/components/modals'
import { Section, CollagePreset, CaseStudy, TeamMember, Image, VideoLibrary } from '@/lib/types'

type CollageImages = {
  pos1: Image | null
  pos2: Image | null
  pos3: Image | null
  pos4: Image | null
  pos5: Image | null
}

type EditProjectModalsProps = {
  showImagePicker: boolean
  setShowImagePicker: (show: boolean) => void
  imagePickerSectionId: string | null
  setImagePickerSectionId: (id: string | null) => void
  collageImagePosition?: string | null
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
  allCases: CaseStudy[]
  selectedCaseIds: string[]
  onToggleCaseSelection: (caseId: string) => void
  onSaveCaseSelection: () => Promise<void>

  showTeamPicker: boolean
  setShowTeamPicker: (show: boolean) => void
  allTeamMembers: TeamMember[]
  selectedTeamMemberIds: string[]
  onToggleTeamSelection: (teamMemberId: string) => void
  onSaveTeamSelection: () => Promise<void>

  showPresetPicker: boolean
  setShowPresetPicker: (show: boolean) => void
  selectedPreset: CollagePreset | null
  onPresetSelect: (preset: CollagePreset & { images: CollageImages }) => Promise<void>
}

export function EditProjectModals({
  showImagePicker,
  setShowImagePicker,
  imagePickerSectionId,
  setImagePickerSectionId,
  collageImagePosition,
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
        selectedImageIds={(() => {
          if (!imagePickerSectionId) return []
          const images = sectionImages[imagePickerSectionId] || []
          if (collageImagePosition) {
            const posIndex = parseInt(collageImagePosition.replace('pos', '')) - 1
            const img = images[posIndex]
            return img ? [img.id] : []
          }
          return images.map(img => img.id)
        })()}
        maxSelection={
          imagePickerSectionId
            ? (() => {
                if (collageImagePosition) return 1
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

