'use client'

import { Section, CaseStudy } from '@/lib/types'
import { Button, Heading, Text } from '@/components/ui'

type CasesSectionProps = {
  section: Section
  editMode: boolean
  allCases: CaseStudy[]
  selectedCaseIds: string[]
  updateSectionContent: (sectionId: string, key: string, value: string | any) => void
  onCasePickerOpen: () => void
}

export function CasesSection({
  section,
  editMode,
  allCases,
  selectedCaseIds,
  updateSectionContent,
  onCasePickerOpen
}: CasesSectionProps) {
  return (
    <div className="relative -mt-24 mb-30 pt-24">
      {/* Sentrert tekstboks */}
      <div className="flex justify-center mb-8 -mt-16">
        <div className="max-w-2xl w-full p-6 bg-background-widget shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1),0_-2px_4px_-1px_rgba(0,0,0,0.06)] relative z-20">
          <Heading 
            as="h2" 
            size="2xl" 
            className={`mb-4 text-center ${editMode ? 'cursor-text hover:outline hover:outline-2 hover:outline-black/50 hover:outline-dashed rounded px-2 py-1' : ''}`}
            contentEditable={editMode}
            suppressContentEditableWarning
            onBlur={(e) => {
              if (editMode) {
                updateSectionContent(section.id, 'title', e.currentTarget.textContent || '')
              }
            }}
          >
            {section.content.title || 'EKSEMPELARBEID'}
          </Heading>
          <Text 
            variant="body" 
            className={`text-center ${editMode ? 'cursor-text hover:outline hover:outline-2 hover:outline-black/50 hover:outline-dashed rounded px-2 py-1 min-h-[60px]' : ''}`}
            contentEditable={editMode}
            suppressContentEditableWarning
            onBlur={(e) => {
              if (editMode) {
                updateSectionContent(section.id, 'description', e.currentTarget.textContent || '')
              }
            }}
          >
            {section.content.description ||'Se utvalg av våre tidligere prosjekter'}
          </Text>
        </div>
      </div>

      {editMode && (
        <div className="flex justify-center mb-6">
          <Button
            type="button"
            variant="secondary"
            onClick={onCasePickerOpen}
          >
            {selectedCaseIds.length > 0 ? `Endre cases (${selectedCaseIds.length}/4)` : 'Velg cases'}
          </Button>
        </div>
      )}
      
      {selectedCaseIds.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {selectedCaseIds.map((caseId) => {
            const caseStudy = allCases.find(c => c.id === caseId)
            if (!caseStudy) return null
            
            // Extract Vimeo ID from URL
            const getVimeoId = (url: string): string | null => {
              const match = url.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/)
              return match ? match[1] : null
            }
            
            const vimeoId = caseStudy.vimeo_id || getVimeoId(caseStudy.vimeo_url)
            
            return (
              <div key={caseId} className="text-center">
                {vimeoId ? (
                  <div className="aspect-video bg-zinc-300 rounded-lg mb-3 overflow-hidden">
                    <iframe
                      src={`https://player.vimeo.com/video/${vimeoId}?title=0&byline=0&portrait=0`}
                      className="w-full h-full"
                      frameBorder="0"
                      allow="autoplay; fullscreen; picture-in-picture"
                      allowFullScreen
                      title={caseStudy.title}
                    ></iframe>
                  </div>
                ) : (
                  <div className="aspect-video bg-zinc-300 rounded-lg mb-3 flex items-center justify-center">
                    {caseStudy.thumbnail_path ? (
                      <img src={caseStudy.thumbnail_path} alt={caseStudy.title} className="w-full h-full object-cover rounded-lg" />
                    ) : (
                      <Text variant="muted">🎬</Text>
                    )}
                  </div>
                )}
                
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

