'use client'

import { Section } from '@/lib/types'

type ContactSectionProps = {
  section: Section
  editMode: boolean
  getSectionTitle?: (type: string) => string
  updateSectionContent: (sectionId: string, key: string, value: string | any) => void
}

const DEFAULT_CONTACT_TEXT = `LEAFILMS\neivind@leafilms.no`

export function ContactSection({
  section,
  editMode,
  getSectionTitle,
  updateSectionContent
}: ContactSectionProps) {
  const displayText = section.content.text || DEFAULT_CONTACT_TEXT

  return (
    <div className="py-20 md:py-32 px-8 md:px-16 flex flex-col items-start">
      {/* Section label */}
      <div className="flex items-center gap-4 mb-10">
        <div style={{ width: 32, height: 1, background: '#C49434' }} />
        <span
          className={editMode ? 'edit-outline px-2 py-1 cursor-text' : ''}
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.78rem',
            letterSpacing: '0.16em',
            color: '#C49434',
            textTransform: 'uppercase',
            fontWeight: 500,
          }}
          contentEditable={editMode}
          suppressContentEditableWarning
          onBlur={(e) => {
            if (editMode) updateSectionContent(section.id, 'sectionLabel', e.currentTarget.textContent || '')
          }}
        >
          {section.content.sectionLabel || (getSectionTitle ? getSectionTitle(section.type) : 'Kontakt')}
        </span>
      </div>

      {/* Contact info */}
      <div
        className={`whitespace-pre-wrap ${editMode ? 'edit-outline px-4 py-3 min-h-[80px]' : ''}`}
        contentEditable={editMode}
        suppressContentEditableWarning
        onBlur={(e) => {
          if (editMode) updateSectionContent(section.id, 'text', e.currentTarget.textContent || '')
        }}
        style={{
          fontFamily: 'var(--font-cormorant)',
          fontSize: 'clamp(1.1rem, 1.6vw, 1.5rem)',
          fontWeight: 300,
          fontStyle: 'italic',
          color: '#E8E1D5',
          lineHeight: 1.3,
          letterSpacing: '-0.01em',
        }}
      >
        {displayText}
      </div>

      {/* Bottom rule */}
      <div className="mt-16 flex items-center gap-6 w-full max-w-xs">
        <div style={{ flex: 1, height: 1, background: '#2A261F' }} />
        <span style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: '0.55rem',
          letterSpacing: '0.18em',
          color: '#62594E',
          textTransform: 'uppercase',
        }}>
          Leafilms
        </span>
      </div>
    </div>
  )
}
