import { Heading, Text, Button } from '@/components/ui'
import { Section, CaseStudy } from '@/lib/types'

type SectionPreviewProps = {
  section: Section
  index: number
  caseStudies?: CaseStudy[]
}

export function SectionPreview({ section, index, caseStudies = [] }: SectionPreviewProps) {
  const getSectionTitle = (type: string) => {
    const titles: Record<string, string> = {
      goal: 'Mål',
      concept: 'Konsept',
      cases: 'Tidligere arbeid',
      moodboard: 'Moodboard',
      timeline: 'Tidslinje',
      deliverables: 'Leveranser',
      contact: 'Kontakt'
    }
    return titles[type] || type
  }

  if (!section.visible) return null

  return (
    <section className="py-16 px-8 border-t border-zinc-900 bg-black">
      <div className="max-w-5xl mx-auto">
        {/* Section Header */}
        <div className="mb-8">
          <Text variant="muted" className="tracking-widest uppercase mb-2 block text-xs">
            {String(index + 1).padStart(2, '0')}
          </Text>
          <Heading as="h2" size="lg" className="mb-4">
            {getSectionTitle(section.type)}
          </Heading>
        </div>

        {/* Section Content */}
        <div>
          {/* Text sections */}
          {['goal', 'concept', 'timeline', 'deliverables', 'contact'].includes(section.type) && (
            <Text variant="lead" className="leading-relaxed whitespace-pre-wrap">
              {section.content.text || <span className="text-gray-600 italic">Ingen innhold ennå...</span>}
            </Text>
          )}

          {/* Cases Section */}
          {section.type === 'cases' && (
            <div>
              {section.content.description && (
                <Text variant="lead" className="leading-relaxed mb-8">
                  {section.content.description}
                </Text>
              )}
              
              {caseStudies.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {caseStudies.map((caseStudy) => (
                    <div key={caseStudy.id}>
                      {/* Thumbnail */}
                      <div className="aspect-video bg-zinc-900 rounded-lg overflow-hidden mb-3">
                        {caseStudy.thumbnail_path ? (
                          <img
                            src={caseStudy.thumbnail_path}
                            alt={caseStudy.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Text variant="muted">🎬</Text>
                          </div>
                        )}
                      </div>
                      
                      <Heading as="h3" size="sm" className="mb-2 text-sm">
                        {caseStudy.title}
                      </Heading>
                      
                      <Text variant="body" className="mb-3 text-sm">
                        {caseStudy.description}
                      </Text>
                      
                      <Button variant="secondary" size="sm" className="w-full text-xs">
                        SE VIDEO HER →
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-zinc-900 rounded-lg p-8 text-center">
                  <Text variant="muted" className="text-sm">
                    Velg case studies for å se dem her
                  </Text>
                </div>
              )}
            </div>
          )}

          {/* Moodboard */}
          {section.type === 'moodboard' && (
            <div>
              {section.content.description && (
                <Text variant="lead" className="leading-relaxed mb-6">
                  {section.content.description}
                </Text>
              )}
              <div className="bg-zinc-900 rounded-lg p-8 text-center">
                <Text variant="muted" className="text-sm">
                  📸 Bilder kommer her
                </Text>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

