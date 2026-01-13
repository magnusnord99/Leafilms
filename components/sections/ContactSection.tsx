'use client'

import { Section } from '@/lib/types'
import { Heading, Text } from '@/components/ui'

type ContactSectionProps = {
  section: Section
  editMode: boolean
  updateSectionContent: (sectionId: string, key: string, value: string | any) => void
}

const DEFAULT_CONTACT_TEXT = `LEAFILMS
eivind@leafilms.no`

export function ContactSection({
  section,
  editMode,
  updateSectionContent
}: ContactSectionProps) {
  const defaultText = DEFAULT_CONTACT_TEXT
  const displayText = section.content.text || defaultText

  return (
    <div className="mt-30">
      <Heading 
        as="h4" 
        className="mb-6 text-center"
      >
        KONTAKT
      </Heading>
      <Text 
        variant="body" 
        className={`whitespace-pre-wrap text-center ${editMode ? 'cursor-text hover:outline hover:outline-2 hover:outline-black/50 hover:outline-dashed rounded px-2 py-1 min-h-[100px]' : ''}`}
        contentEditable={editMode}
        suppressContentEditableWarning
        onBlur={(e) => {
          if (editMode) {
            updateSectionContent(section.id, 'text', e.currentTarget.textContent || '')
          }
        }}
      >
        {displayText}
      </Text>
    </div>
  )
}

