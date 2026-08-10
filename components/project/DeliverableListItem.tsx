'use client'

import { Text } from '@/components/ui'
import { getDeliverableType } from './DeliverableCard'

interface DeliverableListItemProps {
  title?: string
  quantity?: number
  format?: string
  description?: string
  onRemove?: () => void
  onChange?: (field: 'title' | 'quantity' | 'format' | 'description', value: string) => void
  editMode?: boolean
}

export function DeliverableListItem({
  title = 'LEVERANSE',
  quantity,
  format,
  description,
  onRemove,
  onChange,
  editMode = false
}: DeliverableListItemProps) {
  const deliverableType = getDeliverableType(title, format || '')

  const editableClass = editMode && onChange
    ? 'cursor-text hover:bg-white/5 rounded px-1 -mx-1 outline-none focus:bg-white/10'
    : ''

  return (
    <div
      className="flex gap-4 py-4 px-4 md:px-5 items-start"
      style={{ borderBottom: '1px solid #2A261F' }}
    >
      {/* Type-ikon */}
      <div className="flex-shrink-0 pt-0.5 opacity-70" style={{ color: '#C49434' }} title={deliverableType === 'video' ? 'Video' : 'Bilde'}>
        {deliverableType === 'video' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        )}
      </div>

      {/* Tittel + beskrivelse */}
      <div className="flex-1 min-w-0">
        <Text
          variant="small"
          className={`font-semibold uppercase break-words whitespace-pre-line ${editableClass}`}
          style={{ color: '#E8E1D5', letterSpacing: '0.03em' }}
          contentEditable={editMode && !!onChange}
          suppressContentEditableWarning
          onBlur={(e) => {
            // innerText bevarer linjeskift som faktisk vises i kontenteditable-feltet
            // — textContent strippet dem, så et bevisst linjeskift i tittelen
            // gikk tapt ved lagring (feedback 4fcd83a0).
            if (editMode && onChange) onChange('title', e.currentTarget.innerText || '')
          }}
        >
          {title}
        </Text>

        {editMode ? (
          <textarea
            value={description || ''}
            onChange={(e) => onChange?.('description', e.target.value)}
            placeholder="Beskriv leveransen..."
            rows={2}
            className="w-full mt-1.5 resize-none focus:outline-none px-2 py-1"
            style={{
              background: '#161410',
              border: '1px solid #38332A',
              color: '#B4AA98',
              fontSize: '0.72rem',
              fontFamily: 'var(--font-dm-sans)',
              borderRadius: 1,
            }}
          />
        ) : description ? (
          <Text variant="muted" className="mt-1 break-words" style={{ color: '#8A8073', fontSize: '0.78rem' }}>
            {description}
          </Text>
        ) : null}
      </div>

      {/* Antall + format */}
      <div className="flex-shrink-0 text-right" style={{ minWidth: 90 }}>
        {editMode && onChange ? (
          <input
            type="number"
            min={1}
            value={quantity ?? ''}
            onChange={(e) => onChange('quantity', e.target.value)}
            placeholder="0"
            className="text-right text-xs w-14 bg-transparent outline-none border-b border-white/20 focus:border-white/60"
            style={{ fontFamily: 'inherit', color: '#E8E1D5' }}
          />
        ) : (
          <Text variant="muted" className="text-xs" style={{ color: '#B4AA98' }}>
            {quantity != null ? `${quantity} stk` : ''}
          </Text>
        )}

        <Text
          variant="muted"
          className={`text-xs break-words block mt-0.5 ${editableClass}`}
          style={{ color: '#8A8073' }}
          contentEditable={editMode && !!onChange}
          suppressContentEditableWarning
          onBlur={(e) => {
            if (editMode && onChange) onChange('format', e.currentTarget.textContent || '')
          }}
        >
          {format || (editMode ? 'Format' : '')}
        </Text>
      </div>

      {/* Fjern-knapp */}
      {editMode && onRemove && (
        <button
          onClick={() => {
            if (confirm(`Fjerne leveransen «${title}»?`)) onRemove()
          }}
          className="flex-shrink-0 w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white text-xs flex items-center justify-center transition"
          title="Fjern leveranse"
        >
          ×
        </button>
      )}
    </div>
  )
}
