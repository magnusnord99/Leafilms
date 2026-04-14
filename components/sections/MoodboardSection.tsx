'use client'

import { Section } from '@/lib/types'
import { Text } from '@/components/ui'

type MoodboardSectionProps = {
  section: Section
  editMode: boolean
  updateSectionContent: (sectionId: string, key: string, value: string | any) => void
}

export function MoodboardSection({
  section,
  editMode,
  updateSectionContent
}: MoodboardSectionProps) {
  return (
    <div className="px-8 md:px-16 py-12">
      <Text
        variant="lead"
        className={`text-[#E8E1D5] max-w-2xl ${editMode ? 'edit-outline px-3 py-2 min-h-[80px]' : ''}`}
        contentEditable={editMode}
        suppressContentEditableWarning
        onBlur={(e) => {
          if (editMode) updateSectionContent(section.id, 'description', e.currentTarget.textContent || '')
        }}
      >
        {section.content.description || (editMode ? 'Klikk for å redigere beskrivelse...' : 'Beskrivelse...')}
      </Text>

      <div className="mt-8">
        <div
          className="flex items-center justify-center"
          style={{
            minHeight: 200,
            border: '1px dashed #2A261F',
            borderRadius: 2,
            background: '#161410',
          }}
        >
          {editMode && (
            <Text variant="muted">Moodboard-bilde kommer her</Text>
          )}
        </div>
      </div>
    </div>
  )
}
