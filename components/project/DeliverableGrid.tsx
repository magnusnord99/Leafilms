'use client'

import { DeliverableCard } from './DeliverableCard'
import type { DeliverableItem } from '@/lib/types'

interface DeliverableGridProps {
  items?: DeliverableItem[]
  editMode?: boolean
  language?: 'no' | 'en'
  onItemsChange?: (items: DeliverableItem[]) => void
}

export function DeliverableGrid({ items, editMode = false, language = 'no', onItemsChange }: DeliverableGridProps) {
  // Default items hvis ingen er gitt
  const defaultItems: DeliverableItem[] = [
    {
      id: '1',
      type: 'video',
      name: 'HOVEDFILM',
      format: '16:9 - 2:00 min',
      description: 'Ferdig redigert hovedfilm med fargekorrigering og lyddesign.'
    },
    {
      id: '2',
      type: 'photo',
      name: 'BILDER',
      quantity: 15,
      format: '1:1',
      description: 'Profesjonelle bilder med retusjering.'
    }
  ]

  const displayItems = items || defaultItems

  const handleRemove = (id: string) => {
    if (!onItemsChange) return
    const newItems = displayItems.filter(item => item.id !== id)
    onItemsChange(newItems)
  }

  const handleAdd = () => {
    if (!onItemsChange) return
    const newId = String(Date.now())
    const newItems: DeliverableItem[] = [...displayItems, {
      id: newId,
      type: 'annet',
      name: 'NY LEVERANSE',
      quantity: 1,
      format: '',
      description: ''
    }]
    onItemsChange(newItems)
  }

  // "+ Legg til flere videoer" — video er alltid individuelt navngitte rader (ingen quantity),
  // så bulk-tillegg oppretter N rader med placeholder-navn i stedet for ett antall-felt. Se
  // docs/superpowers/specs/2026-09-07-unified-deliverables-list-design.md §3.
  const handleAddVideos = () => {
    if (!onItemsChange) return
    const count = parseInt(prompt('Hvor mange videoer?') ?? '', 10)
    if (!count || count < 1) return
    const existingVideoCount = displayItems.filter(item => item.type === 'video').length
    const newRows: DeliverableItem[] = Array.from({ length: count }, (_, idx) => ({
      id: `${Date.now()}-${idx}`,
      type: 'video',
      name: `Reel ${existingVideoCount + idx + 1}`,
    }))
    onItemsChange([...displayItems, ...newRows])
  }

  const handleFieldChange = (id: string, field: 'type' | 'name' | 'quantity' | 'format' | 'description', value: string) => {
    if (!onItemsChange) return
    const parsed = field === 'quantity' ? (parseInt(value, 10) || 1) : value
    const newItems = displayItems.map(item =>
      item.id === id ? { ...item, [field]: parsed } : item
    )
    onItemsChange(newItems)
  }

  return (
    <div className="w-full">
    <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-row md:flex-wrap gap-4 mt-8 items-start w-full">
      {displayItems.map((item) => (
        <DeliverableCard
          key={item.id}
          type={item.type}
          name={item.name}
          quantity={item.quantity}
          format={item.format}
          description={item.description}
          onRemove={editMode && onItemsChange ? () => handleRemove(item.id) : undefined}
          onChange={editMode && onItemsChange ? (field, value) => handleFieldChange(item.id, field, value) : undefined}
          editMode={editMode}
        />
      ))}

      {/* Legg til-knapper i edit mode */}
      {editMode && onItemsChange && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleAdd()
          }}
          className="p-4 flex flex-col items-center justify-center transition-all duration-300 cursor-pointer w-full md:w-[140px] min-h-[160px] flex-shrink-0"
          style={{
            border: '1px dashed #38332A',
            background: 'transparent',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#C49434' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#38332A' }}
        >
          <span style={{ fontSize: '1.5rem', color: '#38332A', lineHeight: 1 }}>+</span>
          <span style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.6rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#62594E',
            marginTop: '0.5rem',
          }}>Legg til</span>
        </button>
      )}
      {editMode && onItemsChange && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleAddVideos()
          }}
          className="p-4 flex flex-col items-center justify-center transition-all duration-300 cursor-pointer w-full md:w-[140px] min-h-[160px] flex-shrink-0"
          style={{
            border: '1px dashed #38332A',
            background: 'transparent',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#C49434' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#38332A' }}
        >
          <span style={{ fontSize: '1.5rem', color: '#38332A', lineHeight: 1 }}>+N</span>
          <span style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.6rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#62594E',
            marginTop: '0.5rem',
            textAlign: 'center',
          }}>Flere videoer</span>
        </button>
      )}
    </div>
    <p style={{
      fontFamily: 'var(--font-dm-sans)',
      fontSize: '0.72rem',
      letterSpacing: '0.1em',
      color: '#62594E',
      marginTop: '1rem',
      textTransform: 'uppercase',
    }}>
      {language === 'en' ? 'Tap cards for more info' : 'Trykk på kortene for mer info'}
    </p>
    </div>
  )
}

