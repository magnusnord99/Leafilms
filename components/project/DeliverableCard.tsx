'use client'

import { useState } from 'react'
import { Text } from '@/components/ui'

/**
 * Leveranse-kort med flip-effekt (som team-medlemskort).
 * Klikk på kortet for å snu til baksiden med beskrivelse.
 */

interface DeliverableCardProps {
  title?: string
  quantity?: number
  format?: string // "16:9", "9:16", "1:1", "2:30 min", etc.
  aspectRatio?: string // Beholder for bakoverkompatibilitet
  description?: string
  onRemove?: () => void
  onChange?: (field: 'title' | 'quantity' | 'format' | 'description', value: string) => void
  editMode?: boolean
}

/** Avgjør om leveransen er video eller bilde basert på tittel og format */
function getDeliverableType(title: string, format: string): 'video' | 'image' {
  const t = (title || '').toLowerCase()
  const f = (format || '').toLowerCase()
  const videoKeywords = ['film', 'video', 'cutdown', 'reklame', 'spot', 'klipp', 'redigering', 'teaser', 'reel']
  const imageKeywords = ['bilde', 'bilder', 'foto', 'produktbilde', 'portrett']
  if (videoKeywords.some(kw => t.includes(kw))) return 'video'
  if (imageKeywords.some(kw => t.includes(kw))) return 'image'
  if (/\d+\s*(min|sek)/.test(f) || f.includes('min') || f.includes('sek')) return 'video'
  return 'image'
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
  const deliverableType = getDeliverableType(title, displayFormat || '')

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
        className="relative w-full h-full transition-all duration-700 cursor-pointer"
        style={{
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
        }}
      >
        {/* ═══ FORSIDE ═══ 
            Farge: bg-background-widget-red (se globals.css for andre farger)
            Padding: p-4 (16px) – endre for mer/mindre luft */}
        <div
          className="absolute inset-0 w-full h-full p-4 overflow-hidden"
          style={{
            backfaceVisibility: 'hidden',
            background: '#1E1B16',
            border: '1px solid #2A261F',
            borderTop: '1px solid #38332A',
          }}
        >
          <div className="flex flex-col items-center justify-center h-full text-center">
            {/* Type-ikon: video eller bilde */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 opacity-70" title={deliverableType === 'video' ? 'Video' : 'Bilde'}>
              {deliverableType === 'video' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
              )}
            </div>
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

            {/* Tittel: line-clamp-2 kun i visningsmodde for kompakt kortlayout */}
            <Text
              variant="small"
              className={`text-dark mb-1 font-semibold uppercase ${editMode ? '' : 'line-clamp-2'} break-words ${editableClass}`}
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

            {/* Antall */}
            {editMode && onChange ? (
              <input
                type="number"
                min={1}
                value={quantity ?? ''}
                onChange={(e) => onChange('quantity', e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="0"
                className="text-dark text-center text-xs w-12 bg-transparent outline-none border-b border-white/20 focus:border-white/60"
                style={{ fontFamily: 'inherit', color: 'inherit' }}
              />
            ) : (
              <Text variant="muted" className="text-dark text-center text-xs">
                {quantity != null ? `${quantity} stk` : ''}
              </Text>
            )}

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
          className="absolute inset-0 w-full h-full p-4 overflow-hidden"
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            background: '#2A261F',
            border: '1px solid #38332A',
            borderTop: '2px solid #C49434',
          }}
        >
          <div className="flex flex-col items-center justify-start h-full text-center overflow-y-auto [font-size:0.6rem] pt-2">
            

            {/* Beskrivelse: textarea i edit-modus, tekst i visningsmodus. 'Ingen beskrivelse' = fallback når tom */}
            {editMode ? (
              <textarea
                value={description || ''}
                onChange={(e) => onChange?.('description', e.target.value)}
                placeholder="Beskriv leveransen..."
                onClick={(e) => e.stopPropagation()}
                className="w-full flex-1 min-h-[80px] resize-none focus:outline-none px-2 py-1"
                style={{
                  background: '#161410',
                  border: '1px solid #38332A',
                  color: '#E8E1D5',
                  fontSize: '0.72rem',
                  fontFamily: 'var(--font-dm-sans)',
                  borderRadius: 1,
                }}
              />
            ) : (
              <Text
                variant="xs"
                className="text-dark break-words"
                style={{
                  fontSize: '0.8rem',
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
