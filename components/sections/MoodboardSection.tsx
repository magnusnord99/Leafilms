'use client'

import { Section } from '@/lib/types'

type MoodboardSectionProps = {
  section: Section
  editMode: boolean
  updateSectionContent: (sectionId: string, key: string, value: unknown) => void
}

export function MoodboardSection({
  section,
  editMode,
  updateSectionContent
}: MoodboardSectionProps) {
  return (
    <div className="px-8 md:px-16 py-16 md:py-20">
      {/* Section label */}
      <div className="flex items-center gap-3 mb-8">
        <div style={{ width: 24, height: 1, background: '#C49434' }} />
        <span style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: '0.72rem',
          letterSpacing: '0.18em',
          color: '#C49434',
          textTransform: 'uppercase',
          fontWeight: 500,
        }}>
          Moodboard
        </span>
      </div>

      <div
        className={`max-w-2xl mb-10 ${editMode ? 'edit-outline px-3 py-2 min-h-[80px]' : ''}`}
        contentEditable={editMode}
        suppressContentEditableWarning
        onBlur={(e) => {
          if (editMode) updateSectionContent(section.id, 'description', e.currentTarget.textContent || '')
        }}
        style={{
          fontFamily: 'var(--font-cormorant)',
          fontSize: 'clamp(1.4rem, 2.2vw, 2rem)',
          fontWeight: 300,
          fontStyle: 'italic',
          color: '#E8E1D5',
          lineHeight: 1.35,
        }}
      >
        {section.content.description || (editMode ? 'Klikk for å redigere beskrivelse...' : '')}
      </div>

      <div>
        <div
          className="flex items-center justify-center"
          style={{
            minHeight: editMode ? 200 : 0,
            border: editMode ? '1px dashed #2A261F' : 'none',
            borderRadius: 2,
            background: editMode ? '#161410' : 'transparent',
          }}
        >
          {editMode && (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#38332A' }}>
              Moodboard-bilde kommer her
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
