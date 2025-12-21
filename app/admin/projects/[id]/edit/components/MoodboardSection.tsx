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
    <div>
      <Text 
        variant="body"
        className={editMode ? 'cursor-text hover:outline hover:outline-2 hover:outline-black/50 hover:outline-dashed rounded px-2 py-1 min-h-[80px]' : ''}
        contentEditable={editMode}
        suppressContentEditableWarning
        onBlur={(e) => {
          if (editMode) {
            updateSectionContent(section.id, 'description', e.currentTarget.textContent || '')
          }
        }}
      >
        {section.content.description || (editMode ? 'Klikk for å redigere beskrivelse...' : 'Beskrivelse...')}
      </Text>
      
      <div className="mt-8 p-4">
        <div className="border-2 border-dashed border-zinc-400 rounded-lg p-8 bg-zinc-200">
          <Text variant="body" className="text-center text-zinc-600">
            {editMode ? 'Bilde kommer her' : ''}
          </Text>
        </div>
      </div>
    </div>
  )
}

