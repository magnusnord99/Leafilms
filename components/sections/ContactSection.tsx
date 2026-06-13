'use client'

import { Section } from '@/lib/types'

type ContactSectionProps = {
  section: Section
  editMode: boolean
  getSectionTitle?: (type: string) => string
  updateSectionContent: (sectionId: string, key: string, value: unknown) => void
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
    <div className="py-20 md:py-32 px-8 md:px-16">
      {/* Top rule */}
      <div className="flex items-center gap-6 mb-12 md:mb-16 max-w-2xl">
        <div style={{ width: 32, height: 1, background: '#C49434' }} />
        <span
          className={editMode ? 'edit-outline px-2 py-1 cursor-text' : ''}
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.72rem',
            letterSpacing: '0.18em',
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

      {/* Large cinematic display heading */}
      <p style={{
        fontFamily: 'var(--font-cormorant)',
        fontSize: 'clamp(2rem, 4vw, 3.5rem)',
        fontWeight: 300,
        fontStyle: 'italic',
        color: '#E8E1D5',
        lineHeight: 0.95,
        letterSpacing: '-0.02em',
        marginBottom: '2.5rem',
      }}>
        Har du noen spørsmål?
      </p>

      {/* Contact info */}
      <div
        className={`whitespace-pre-wrap ${editMode ? 'edit-outline px-4 py-3 min-h-[80px]' : ''}`}
        contentEditable={editMode}
        suppressContentEditableWarning
        onBlur={(e) => {
          if (editMode) updateSectionContent(section.id, 'text', e.currentTarget.textContent || '')
        }}
        style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 'clamp(0.85rem, 1.1vw, 1rem)',
          fontWeight: 300,
          color: '#9E9287',
          lineHeight: 1.8,
          letterSpacing: '0.04em',
        }}
      >
        {displayText}
      </div>

      {/* Bottom rule */}
      <div className="mt-16 md:mt-24 flex items-center gap-6">
        <div style={{ flex: 1, maxWidth: 240, height: 1, background: '#1E1B16' }} />
        <span style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: '0.55rem',
          letterSpacing: '0.22em',
          color: '#38332A',
          textTransform: 'uppercase',
        }}>
          Leafilms
        </span>
        <div style={{ flex: 1, maxWidth: 240, height: 1, background: '#1E1B16' }} />
      </div>
    </div>
  )
}
