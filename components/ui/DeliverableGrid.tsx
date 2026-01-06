'use client'

import { useState } from 'react'
import { DeliverableCard } from './DeliverableCard'

export interface DeliverableItem {
  id: string
  title?: string
  quantity?: string // "20 stk", "1 stk", etc.
  format?: string // "16:9", "9:16", "1:1", "2:30 min", etc.
  aspectRatio?: string // Beholder for bakoverkompatibilitet
  description?: string
}

interface DeliverableGridProps {
  items?: DeliverableItem[]
  editMode?: boolean
  onItemsChange?: (items: DeliverableItem[]) => void
}

export function DeliverableGrid({ items, editMode = false, onItemsChange }: DeliverableGridProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // Default items hvis ingen er gitt
  const defaultItems: DeliverableItem[] = [
    { 
      id: '1', 
      title: 'HOVEDFILM', 
      quantity: '1 stk',
      format: '16:9 - 2:00 min',
      description: 'Ferdig redigert hovedfilm med fargekorrigering og lyddesign.'
    },
    { 
      id: '2', 
      title: 'CUTDOWNS', 
      quantity: '3 stk',
      format: '30 sek',
      description: 'Kortere versjoner tilpasset ulike plattformer.'
    },
    { 
      id: '3', 
      title: 'BILDER', 
      quantity: '15 stk',
      format: '1:1',
      description: 'Profesjonelle bilder med retusjering.'
    }
  ]

  const displayItems = items || defaultItems

  const handleToggle = (id: string) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const handleRemove = (id: string) => {
    if (!onItemsChange) return
    const newItems = displayItems.filter(item => item.id !== id)
    onItemsChange(newItems)
  }

  const handleAdd = () => {
    if (!onItemsChange) return
    const newId = String(Date.now())
    const newItems = [...displayItems, {
      id: newId,
      title: 'NY LEVERANSE',
      quantity: '1 stk',
      format: '',
      description: ''
    }]
    onItemsChange(newItems)
  }

  const handleFieldChange = (id: string, field: 'title' | 'quantity' | 'format' | 'description', value: string) => {
    if (!onItemsChange) return
    const newItems = displayItems.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    )
    onItemsChange(newItems)
  }

  return (
    <div className="grid grid-cols-2 md:flex md:flex-row gap-4 mt-8 items-start w-full">
      {displayItems.map((item) => (
        <DeliverableCard
          key={item.id}
          title={item.title}
          quantity={item.quantity}
          format={item.format}
          aspectRatio={item.aspectRatio}
          description={item.description}
          isExpanded={expandedIds.has(item.id)}
          onToggle={() => handleToggle(item.id)}
          onRemove={editMode && onItemsChange ? () => handleRemove(item.id) : undefined}
          onChange={editMode && onItemsChange ? (field, value) => handleFieldChange(item.id, field, value) : undefined}
          editMode={editMode}
        />
      ))}
      
      {/* Legg til-knapp i edit mode */}
      {editMode && onItemsChange && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleAdd()
          }}
          className="
            bg-background-elevated/50 border-2 border-dashed border-gray-400
            p-4 flex flex-col items-center justify-center
            transition-all duration-300 cursor-pointer
            w-full md:w-[100px] h-[120px] flex-shrink-0
            hover:bg-background-elevated hover:border-gray-500
          "
        >
          <span className="text-2xl text-gray-500">+</span>
          <span className="text-xs text-gray-500 mt-1">Legg til</span>
        </button>
      )}
    </div>
  )
}

