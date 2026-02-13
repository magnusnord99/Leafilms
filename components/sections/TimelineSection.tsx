'use client'

import { useState } from 'react'
import { Section } from '@/lib/types'
import { Heading, Text } from '@/components/ui'

type TimelineSectionProps = {
  section: Section
  editMode: boolean
  timelineSectionProgress: number
  timelineSectionRef: React.RefObject<HTMLDivElement | null>
  getSectionTitle: (type: string) => string
  updateSectionContent: (sectionId: string, key: string, value: string | any) => void
}

const defaultTimelineItems = [
  { title: 'PRE-PRODUKSJON', text: 'Idéutvikling, moodboards, storyboards og planlegging av konsept og visuell retning.' },
  { title: 'PRODUKSJON', text: 'Gjennomføring av opptak, koordinering av team og sikring av alt nødvendig materiale.' },
  { title: 'POST-PRODUKSJON', text: 'Redigering, fargekorrigering, lyddesign og ferdigstilling av sluttprodukt.' },
  { title: 'LEVERING', text: 'Eksport i relevante formater, kvalitetssikring og overlevering til kunden.' }
]

export function TimelineSection({
  section,
  editMode,
  timelineSectionProgress,
  timelineSectionRef,
  getSectionTitle,
  updateSectionContent
}: TimelineSectionProps) {
  const [mobileIndex, setMobileIndex] = useState(0)
  const timelineItems = section.content.timelineItems || defaultTimelineItems

  const renderTimelineCard = (index: number, isActive: boolean) => {
    const item = timelineItems[index] || { title: 'FASE', text: '' }
    return (
      <div
        key={index}
        className="flex-shrink-0 w-[300px] max-w-[calc(100vw-4rem)] md:w-[300px] p-8 rounded-lg shadow-lg transition-all duration-300"
        style={{
          backgroundColor: isActive 
            ? 'var(--color-background-widget-red-hover)'
            : 'var(--color-background-widget-red)',
          transform: isActive ? 'scale(1.1)' : 'scale(1)',
          boxShadow: isActive ? '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' : '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
        }}
      >
        <Heading 
          as="h4" 
          className={`mb-4 uppercase font-bold ${editMode ? 'cursor-text hover:outline hover:outline-2 hover:outline-black/50 hover:outline-dashed rounded px-2 py-1' : ''}`}
          contentEditable={editMode}
          suppressContentEditableWarning
          onBlur={(e) => {
            if (editMode) {
              const updatedItems = [...(section.content.timelineItems || defaultTimelineItems)]
              if (!updatedItems[index]) updatedItems[index] = { title: '', text: '' }
              updatedItems[index].title = e.currentTarget.textContent || ''
              updateSectionContent(section.id, 'timelineItems', updatedItems)
            }
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {item.title || (editMode ? 'Klikk for å redigere tittel...' : 'FASE')}
        </Heading>
        <Text 
          variant="body" 
          className={`${editMode ? 'cursor-text hover:outline hover:outline-2 hover:outline-black/50 hover:outline-dashed rounded px-2 py-1 min-h-[100px]' : ''}`}
          contentEditable={editMode}
          suppressContentEditableWarning
          onBlur={(e) => {
            if (editMode) {
              const updatedItems = [...(section.content.timelineItems || defaultTimelineItems)]
              if (!updatedItems[index]) updatedItems[index] = { title: '', text: '' }
              updatedItems[index].text = e.currentTarget.textContent || ''
              updateSectionContent(section.id, 'timelineItems', updatedItems)
            }
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {item.text || (editMode ? 'Klikk for å redigere tekst...' : 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse varius enim in eros elementum tristique.')}
        </Text>
      </div>
    )
  }

  return (
    <div ref={timelineSectionRef} className="w-full overflow-hidden">
      <div className="mt-10 text-center">
        <Heading as="h2" size="md">
          {getSectionTitle(section.type)}
        </Heading>
      </div>

      {/* Mobil: carousel med piler – én fase om gangen (viser under 1024px) */}
      <div className="lg:hidden relative flex items-center justify-center gap-3 mt-16 px-4">
        <button
          type="button"
          onClick={() => setMobileIndex((i) => Math.max(0, i - 1))}
          disabled={mobileIndex === 0}
          aria-label="Forrige fase"
          className="relative z-20 flex-shrink-0 w-10 h-10 rounded-full bg-black/20 hover:bg-black/30 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-dark transition"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="relative z-0 flex-1 min-w-0 flex justify-center">
          {renderTimelineCard(mobileIndex, true)}
        </div>

        <button
          type="button"
          onClick={() => setMobileIndex((i) => Math.min(timelineItems.length - 1, i + 1))}
          disabled={mobileIndex === timelineItems.length - 1}
          aria-label="Neste fase"
          className="relative z-20 flex-shrink-0 w-10 h-10 rounded-full bg-black/20 hover:bg-black/30 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-dark transition"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <p className="lg:hidden text-center text-dark/70 text-sm mt-3 mb-6">
        {mobileIndex + 1} av {timelineItems.length}
      </p>
      
      {/* Desktop: scroll-basert tidslinje (viser fra 1024px) */}
      <div className="hidden lg:block relative overflow-hidden mt-16" style={{ height: '300px' }}>
        <div 
          className="flex gap-6 transition-transform duration-100 ease-out"
          style={{
            transform: editMode 
              ? 'translateX(0)' 
              : `translateX(calc(30vw - 150px - ${timelineSectionProgress * (300 + 24) * 3}px))`
          }}
        >
          {[0, 1, 2, 3].map((index) => {
            const activeIndex = Math.min(Math.floor(timelineSectionProgress * 4), 3)
            const isActive = !editMode && activeIndex === index
            
            const boxProgress = (timelineSectionProgress * 4) - index
            const fadeProgress = Math.max(0, Math.min(1, 1 - Math.abs(boxProgress - 0.5) * 2))
            
            const timelineItems = section.content.timelineItems || [
              { title: 'PRE-PRODUKSJON', text: 'Idéutvikling, moodboards, storyboards og planlegging av konsept og visuell retning.' },
              { title: 'PRODUKSJON', text: 'Gjennomføring av opptak, koordinering av team og sikring av alt nødvendig materiale.' },
              { title: 'POST-PRODUKSJON', text: 'Redigering, fargekorrigering, lyddesign og ferdigstilling av sluttprodukt.' },
              { title: 'LEVERING', text: 'Eksport i relevante formater, kvalitetssikring og overlevering til kunden.' }
            ]
            
            const item = timelineItems[index] || { title: 'FASE', text: '' }
            
            return (
              <div
                key={index}
                className="flex-shrink-0 w-[300px] p-8 rounded-lg shadow-lg transition-all duration-300"
                style={{
                  backgroundColor: isActive 
                    ? 'var(--color-background-widget-red-hover)' // More saturated version of widget-red
                    : 'var(--color-background-widget-red)',
                  transform: isActive ? 'scale(1.1)' : 'scale(1)',
                  boxShadow: isActive ? '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' : '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
              >
                <Heading 
                  as="h4" 
                  className={`mb-4 uppercase font-bold ${editMode ? 'cursor-text hover:outline hover:outline-2 hover:outline-black/50 hover:outline-dashed rounded px-2 py-1' : ''}`}
                  contentEditable={editMode}
                  suppressContentEditableWarning
                  onBlur={(e) => {
                    if (editMode) {
                      const updatedItems = [...(section.content.timelineItems || [])]
                      if (!updatedItems[index]) {
                        updatedItems[index] = { title: '', text: '' }
                      }
                      updatedItems[index].title = e.currentTarget.textContent || ''
                      updateSectionContent(section.id, 'timelineItems', updatedItems)
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {item.title || (editMode ? 'Klikk for å redigere tittel...' : 'FASE')}
                </Heading>
                <Text 
                  variant="body" 
                  className={`${editMode ? 'cursor-text hover:outline hover:outline-2 hover:outline-black/50 hover:outline-dashed rounded px-2 py-1 min-h-[100px]' : ''}`}
                  contentEditable={editMode}
                  suppressContentEditableWarning
                  onBlur={(e) => {
                    if (editMode) {
                      const updatedItems = [...(section.content.timelineItems || [])]
                      if (!updatedItems[index]) {
                        updatedItems[index] = { title: '', text: '' }
                      }
                      updatedItems[index].text = e.currentTarget.textContent || ''
                      updateSectionContent(section.id, 'timelineItems', updatedItems)
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {item.text || (editMode ? 'Klikk for å redigere tekst...' : 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse varius enim in eros elementum tristique.')}
                </Text>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

