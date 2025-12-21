'use client'

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

export function TimelineSection({
  section,
  editMode,
  timelineSectionProgress,
  timelineSectionRef,
  getSectionTitle,
  updateSectionContent
}: TimelineSectionProps) {

  return (
    <div ref={timelineSectionRef} className="w-full overflow-hidden">
      <div className="mt-10 text-center">
        <Heading as="h2" size="2xl">
          {getSectionTitle(section.type)}
        </Heading>
      </div>
      
      <div className="relative overflow-hidden mt-16" style={{ height: '500px' }}>
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
                    ? 'var(--color-background-widget)' 
                    : `rgba(182, 203, 215, ${0.5 + fadeProgress * 0.3})`,
                  transform: isActive ? 'scale(1.1)' : 'scale(1)',
                  boxShadow: isActive ? '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' : '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
              >
                <Heading 
                  as="h3" 
                  size="sm" 
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

