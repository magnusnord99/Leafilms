'use client'

import { useState } from 'react'
import { Text } from '@/components/ui'

/**
 * Leveranse-kort med flip-effekt (som team-medlemskort).
 * Klikk på kortet for å snu til baksiden med beskrivelse.
 */

interface DeliverableCardProps {
  title?: string
  quantity?: string // "20 stk", "1 stk", etc.
  format?: string // "16:9", "9:16", "1:1", "2:30 min", etc.
  aspectRatio?: string // Beholder for bakoverkompatibilitet
  description?: string
  onRemove?: () => void
  onChange?: (field: 'title' | 'quantity' | 'format' | 'description', value: string) => void
  editMode?: boolean
}

export function DeliverableCard({
  title = 'LEVERANSE',
  quantity,
  format,
  aspectRatio,
  description,
  onRemove,
  onChange,
  editMode = false
}: DeliverableCardProps) {
  const [isFlipped, setIsFlipped] = useState(false)
  const displayFormat = format || aspectRatio

  /* Styling for redigerbare felt i edit-modus */
  const editableClass = editMode && onChange
    ? 'cursor-text hover:bg-black/5 rounded px-1 min-w-[40px] outline-none focus:bg-black/10'
    : ''

  return (
    // Kortstørrelse: endre w-full, md:w-[140px], h-[160px] for bredde/høyde
    <div
      className="relative w-full md:w-[140px] h-[160px] flex-shrink-0"
      style={{ perspective: '1000px' }}
    >
      {/* Flip-animasjon: duration-700 = hastighet, hover:scale-105 = zoom ved hover */}
      <div
        onClick={() => setIsFlipped(!isFlipped)}
        className="relative w-full h-full transition-all duration-700 cursor-pointer hover:scale-105"
        style={{
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
        }}
      >
        {/* ═══ FORSIDE ═══ 
            Farge: bg-background-widget-red (se globals.css for andre farger)
            Padding: p-4 (16px) – endre for mer/mindre luft */}
        <div
          className="absolute inset-0 w-full h-full bg-background-widget-red rounded-lg p-4 shadow-lg overflow-hidden"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <div className="flex flex-col items-center justify-center h-full text-center">
            {/* Fjern-knapp: vises kun i edit-modus */}
            {editMode && onRemove && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove()
                }}
                className="absolute top-1 right-1 z-10 w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white text-xs flex items-center justify-center transition"
                title="Fjern leveranse"
              >
                ×
              </button>
            )}

            {/* Tittel: line-clamp-2 = max 2 linjer, variant="small" = fontstørrelse */}
            <Text
              variant="small"
              className={`text-dark mb-1 font-semibold uppercase line-clamp-2 break-words ${editableClass}`}
              contentEditable={editMode && !!onChange}
              suppressContentEditableWarning
              onBlur={(e) => {
                if (editMode && onChange) {
                  onChange('title', e.currentTarget.textContent || '')
                }
              }}
              onClick={(e) => editMode && e.stopPropagation()}
            >
              {title}
            </Text>

            {/* Antall: f.eks. "1 stk", "10 stk" */}
            <Text
              variant="muted"
              className={`text-dark text-center text-xs ${editableClass}`}
              contentEditable={editMode && !!onChange}
              suppressContentEditableWarning
              onBlur={(e) => {
                if (editMode && onChange) {
                  onChange('quantity', e.currentTarget.textContent || '')
                }
              }}
              onClick={(e) => editMode && e.stopPropagation()}
            >
              {quantity || (editMode ? 'Antall' : '')}
            </Text>

            {/* Format: f.eks. "9:16, 30 sek", "1:1" */}
            <Text
              variant="muted"
              className={`text-dark/60 text-center text-xs break-words ${editableClass}`}
              contentEditable={editMode && !!onChange}
              suppressContentEditableWarning
              onBlur={(e) => {
                if (editMode && onChange) {
                  onChange('format', e.currentTarget.textContent || '')
                }
              }}
              onClick={(e) => editMode && e.stopPropagation()}
            >
              {displayFormat || (editMode ? 'Format' : '')}
            </Text>
          </div>
        </div>

        {/* ═══ BAKSIDE ═══
            Farge: bg-background-widget-red-hover (mørkere variant)
            Her vises beskrivelsen */}
        <div
          className="absolute inset-0 w-full h-full bg-background-widget-red-hover rounded-lg p-4 shadow-lg overflow-hidden"
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)'
          }}
        >
          <div className="flex flex-col items-center justify-center h-full text-center overflow-y-auto [font-size:0.6rem]">
            <Text
              variant="xs"
              className="text-dark font-semibold uppercase mb-2 break-words"
              style={{ fontSize: '0.6rem' }}
            >
              {title}
            </Text>

            {/* Beskrivelse: textarea i edit-modus, tekst i visningsmodus. 'Ingen beskrivelse' = fallback når tom */}
            {editMode ? (
              <textarea
                value={description || ''}
                onChange={(e) => onChange?.('description', e.target.value)}
                placeholder="Beskriv leveransen..."
                onClick={(e) => e.stopPropagation()}
                className="w-full flex-1 min-h-[80px] text-dark bg-white/50 border border-dark/20 rounded px-2 py-1 resize-none focus:outline-none focus:ring-2 focus:ring-dark/20"
              />
            ) : (
              <Text
                variant="xs"
                className="text-dark break-words"
                style={{
                  fontSize: '0.6rem',
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word'
                }}
              >
                {description || 'Ingen beskrivelse'}
              </Text>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
