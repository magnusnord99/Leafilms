'use client'

import { Text } from './Text'

interface DeliverableCardProps {
  title?: string
  quantity?: string // "20 stk", "1 stk", etc.
  format?: string // "16:9", "9:16", "1:1", "2:30 min", etc.
  aspectRatio?: string // Beholder for bakoverkompatibilitet
  description?: string
  isExpanded?: boolean
  onToggle?: () => void
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
  isExpanded = false,
  onToggle,
  onRemove,
  onChange,
  editMode = false
}: DeliverableCardProps) {
  // Bruk format hvis tilgjengelig, ellers aspectRatio
  const displayFormat = format || aspectRatio

  const editableClass = editMode && onChange 
    ? 'cursor-text hover:bg-black/5 rounded px-1 min-w-[40px] outline-none focus:bg-black/10' 
    : ''

  return (
    <div
      onClick={(e) => {
        // Bare toggle hvis vi ikke er i edit mode eller klikket på et redigerbart felt
        if (!editMode) {
          e.stopPropagation()
          onToggle?.()
        }
      }}
      className={`
        bg-background-elevated p-4 flex flex-col items-center justify-start
        transition-all duration-300
        w-full md:w-[120px] flex-shrink-0 relative
        ${isExpanded ? 'min-h-[200px]' : 'h-[120px]'}
        ${!editMode ? 'cursor-pointer hover:bg-background-surface md:hover:scale-105 md:hover:shadow-lg md:hover:-translate-y-1' : ''}
      `}
    >
      {/* Fjern-knapp i edit mode */}
      {editMode && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white text-xs flex items-center justify-center transition"
          title="Fjern leveranse"
        >
          ×
        </button>
      )}

      {/* Expand/Collapse knapp i edit mode */}
      {editMode && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggle?.()
          }}
          className="absolute top-1 left-1 w-5 h-5 rounded-full bg-gray-300 hover:bg-gray-400 text-gray-700 text-xs flex items-center justify-center transition"
          title={isExpanded ? 'Lukk' : 'Utvid'}
        >
          {isExpanded ? '−' : '+'}
        </button>
      )}
      
      {/* Tittel - redigerbar */}
      <Text 
        variant="small" 
        className={`text-dark text-center mb-1 mt-4 font-semibold uppercase ${editableClass}`}
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

      {/* Antall - redigerbar */}
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

      {/* Format - redigerbar */}
      <Text 
        variant="muted" 
        className={`text-dark/60 text-center text-xs ${editableClass}`}
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

      {/* Beskrivelse - redigerbar, vises når ekspandert */}
      {(isExpanded || editMode) && (
        <Text 
          variant="small" 
          className={`text-dark text-center mt-2 px-2 ${editableClass} ${!isExpanded && editMode ? 'hidden' : ''}`}
          contentEditable={editMode && !!onChange && isExpanded}
          suppressContentEditableWarning
          onBlur={(e) => {
            if (editMode && onChange) {
              onChange('description', e.currentTarget.textContent || '')
            }
          }}
          onClick={(e) => editMode && e.stopPropagation()}
        >
          {description || (editMode && isExpanded ? 'Klikk for å legge til beskrivelse...' : '')}
        </Text>
      )}
    </div>
  )
}

