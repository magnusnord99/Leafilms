'use client'

import { useRef, useEffect, useState } from 'react'
import { Project, Section, TeamMember, CaseStudy, Image, SectionImage, CollagePreset } from '@/lib/types'
import { Text } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import {
  HeroSection,
  ConceptSection,
  GoalSection,
  DeliverablesSection,
  TimelineSection,
  ContactSection,
  CasesSection,
  TeamSection,
  ExampleWorkSection,
  QuoteSection
} from '@/app/admin/projects/[id]/edit/components'
import { CollageImages } from '@/app/admin/projects/[id]/edit/components/ExampleWorkSection'
import { useProjectAnalytics } from '@/hooks/useProjectAnalytics'

// Helper for å hente bilde-URL
function getImageUrl(filePath: string): string {
  return supabase.storage.from('assets').getPublicUrl(filePath).data.publicUrl
}

type PublicProjectClientProps = {
  project: Project
  sections: Section[]
  sectionImages: Record<string, Image[]>
  sectionImageData: Record<string, SectionImage[]>
  teamMembers: TeamMember[]
  caseStudies: CaseStudy[]
  collageImages: CollageImages
  selectedPreset: CollagePreset | null
  shareToken: string
}

export function PublicProjectClient({
  project,
  sections,
  sectionImages,
  sectionImageData,
  teamMembers,
  caseStudies,
  collageImages,
  selectedPreset,
  shareToken
}: PublicProjectClientProps) {
  // Initialize analytics tracking
  const sectionIds = sections.map(s => s.id)
  useProjectAnalytics(project.id, shareToken, sectionIds)
  
  // Refs for scroll animations
  const goalSectionRef = useRef<HTMLDivElement>(null)
  const timelineSectionRef = useRef<HTMLDivElement>(null)
  const conceptSectionRef = useRef<HTMLDivElement>(null)

  // Scroll progress states
  const [goalSectionProgress, setGoalSectionProgress] = useState(0)
  const [timelineSectionProgress, setTimelineSectionProgress] = useState(0)
  const [conceptSectionProgress, setConceptSectionProgress] = useState(0)

  // Scroll animations effect - samme logikk som useScrollAnimations hook
  useEffect(() => {
    const handleScroll = () => {
      // Goal section progress
      if (goalSectionRef.current) {
        const element = goalSectionRef.current
        const rect = element.getBoundingClientRect()
        const windowHeight = window.innerHeight
        
        const startPoint = windowHeight * 0.9
        const endPoint = windowHeight * 0.4
        
        const animationRange = startPoint - endPoint
        const currentPosition = rect.top
        
        let progress = (startPoint - currentPosition) / animationRange
        progress = Math.max(0, Math.min(1, progress))
        
        setGoalSectionProgress(progress)
      }

      // Timeline section progress
      if (timelineSectionRef.current) {
        const element = timelineSectionRef.current
        const rect = element.getBoundingClientRect()
        const windowHeight = window.innerHeight
        
        const startPoint = windowHeight * 0.8
        const endPoint = -rect.height * 0.002
        
        const animationRange = startPoint - endPoint
        const currentPosition = rect.top
        
        let progress = (startPoint - currentPosition) / animationRange
        progress = Math.max(0, Math.min(1, progress))
        
        setTimelineSectionProgress(progress)
      }

      // Concept section progress (zoom effect)
      if (conceptSectionRef.current) {
        const element = conceptSectionRef.current
        const rect = element.getBoundingClientRect()
        const windowHeight = window.innerHeight
        
        // Start animasjonen når seksjonen kommer inn i viewport
        const startPoint = windowHeight
        // Slutt når seksjonen er forbi viewport
        const endPoint = windowHeight * 0.1
        
        const animationRange = startPoint - endPoint
        const currentPosition = rect.top
        
        let progress = (startPoint - currentPosition) / animationRange
        progress = Math.max(0, Math.min(1, progress))
        
        setConceptSectionProgress(progress)
      }
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [])

  // Hjelpefunksjoner
  const getSectionTitle = (type: string) => {
    const titles: Record<string, string> = {
      hero: 'HERO',
      goal: 'MÅL',
      concept: 'KONSEPT',
      cases: 'TIDLIGERE ARBEID',
      moodboard: 'MOODBOARD',
      timeline: 'TIDSLINJE',
      deliverables: 'LEVERING',
      contact: 'KONTAKT',
      team: 'TEAM',
      example_work: 'EKSEMPELARBEID',
      quote: 'PRISTILBUD'
    }
    return titles[type] || type.toUpperCase()
  }

  const getBackgroundStyle = (sectionId: string, imageIndex = 0): React.CSSProperties => {
    const images = sectionImages[sectionId]
    const imageData = sectionImageData[sectionId]
    
    if (!images || !images[imageIndex]) return {}
    
    const image = images[imageIndex]
    const data = imageData?.[imageIndex]
    
    const posX = data?.background_position_x ?? 50
    const posY = data?.background_position_y ?? 50
    const zoom = data?.background_zoom
    
    // Håndter zoom: samme logikk som i useSectionImages hook
    // zoom er lagret som desimal (1.0 = 100%, 1.2 = 120%, etc.)
    // Hvis null eller 1.0, bruk 'cover' for å fylle hele containeren
    const backgroundSize = zoom === null || zoom === undefined || zoom === 1.0 
      ? 'cover' 
      : `${zoom * 100}%`
    
    return {
      backgroundImage: `url(${getImageUrl(image.file_path)})`,
      backgroundSize: backgroundSize,
      backgroundPosition: `${posX}% ${posY}%`,
      backgroundRepeat: 'no-repeat'
    }
  }

  // Dummy functions (ikke brukt i view mode)
  const noop = () => {}
  const noopAsync = async () => {}
  const noopEvent = (e: React.MouseEvent) => { e.stopPropagation() }

  const heroSection = sections.find(s => s.type === 'hero')
  // selectedTeamMemberIds og selectedCaseIds skal komme fra props, ikke fra section.content
  // (de er allerede filtrert i page.tsx)
  const selectedTeamMemberIds = teamMembers.map(m => m.id)
  const selectedCaseIds = caseStudies.map(c => c.id)

  // Safety check - if no project, show error
  if (!project) {
    console.error('[PublicProjectClient] No project provided')
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <Text variant="body" className="!text-foreground">
            Feil: Prosjekt ikke funnet
          </Text>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero Section */}
      {heroSection && (
        <div data-section-id={heroSection.id}>
          <HeroSection
            section={heroSection}
            project={project}
            editMode={false}
            sectionImages={sectionImages}
            sectionImageData={sectionImageData}
            editingImageSectionId={null}
            imagePosition={{}}
            getBackgroundStyle={getBackgroundStyle}
            updateSectionContent={noop}
            saveBackgroundPosition={noopAsync}
            setImagePosition={noop}
            onImageClick={noop}
            onEditPositionClick={noopEvent}
            onImagePickerOpen={noop}
          />
        </div>
      )}

      {/* Sections */}
      <div className="relative">
        {sections.length === 0 ? (
          <div className="py-20 px-4 text-center max-w-2xl mx-auto">
            <Text variant="body" className="!text-foreground mb-4">
              Ingen seksjoner å vise
            </Text>
            <Text variant="small" className="!text-foreground/60">
              Prosjektet har ingen synlige seksjoner. Kontakt prosjekteier for mer informasjon.
            </Text>
          </div>
        ) : (
          sections
            .filter(s => s.type !== 'hero')
            .sort((a, b) => {
              // Sorter kontakt-seksjonen alltid til slutt
              if (a.type === 'contact' && b.type !== 'contact') return 1
              if (a.type !== 'contact' && b.type === 'contact') return -1
              // Ellers bruk order_index
              return a.order_index - b.order_index
            })
            .map((section) => {
              if (!section.visible) return null
            
            return (
              <section
                key={section.id}
                data-section-id={section.id}
                className={`${section.type === 'concept' ? 'min-h-screen flex flex-col items-center justify-center px-0' : 'py-section px-2 md:px-4'} ${section.type === 'cases' ? 'bg-transparent' : 'bg-background'} relative`}
              >
                <div className={section.type === 'team' || section.type === 'concept' || section.type === 'example_work' ? 'w-full' : 'max-w-7xl mx-auto'}>
                  {/* Concept Section */}
                  {section.type === 'concept' && (
                    <ConceptSection
                      section={section}
                      editMode={false}
                      sectionImages={sectionImages}
                      sectionImageData={sectionImageData}
                      editingImageSectionId={null}
                      imagePosition={{}}
                      conceptSectionProgress={conceptSectionProgress}
                      conceptSectionRef={conceptSectionRef}
                      getBackgroundStyle={getBackgroundStyle}
                      getSectionTitle={getSectionTitle}
                      updateSectionContent={noop}
                      saveBackgroundPosition={noopAsync}
                      setImagePosition={noop}
                      onImageClick={noop}
                      onEditPositionClick={noopEvent}
                      onImagePickerOpen={noop}
                    />
                  )}

                  {/* Goal Section */}
                  {section.type === 'goal' && (
                    <GoalSection
                      section={section}
                      editMode={false}
                      sectionImages={sectionImages}
                      sectionImageData={sectionImageData}
                      editingImageSectionId={null}
                      imagePosition={{}}
                      goalSectionProgress={goalSectionProgress}
                      goalSectionRef={goalSectionRef}
                      getBackgroundStyle={getBackgroundStyle}
                      getSectionTitle={getSectionTitle}
                      updateSectionContent={noop}
                      saveBackgroundPosition={noopAsync}
                      setImagePosition={noop}
                      onImageClick={noop}
                      onEditPositionClick={noopEvent}
                      onImagePickerOpen={noop}
                    />
                  )}

                  {/* Deliverables Section */}
                  {section.type === 'deliverables' && (
                    <DeliverablesSection
                      section={section}
                      editMode={false}
                      sectionImages={sectionImages}
                      sectionImageData={sectionImageData}
                      editingImageSectionId={null}
                      imagePosition={{}}
                      getBackgroundStyle={getBackgroundStyle}
                      getSectionTitle={getSectionTitle}
                      updateSectionContent={noop}
                      saveBackgroundPosition={noopAsync}
                      setImagePosition={noop}
                      onImageClick={noop}
                      onEditPositionClick={noopEvent}
                      onImagePickerOpen={noop}
                    />
                  )}

                  {/* Timeline Section */}
                  {section.type === 'timeline' && (
                    <TimelineSection
                      section={section}
                      editMode={false}
                      timelineSectionProgress={timelineSectionProgress}
                      timelineSectionRef={timelineSectionRef}
                      getSectionTitle={getSectionTitle}
                      updateSectionContent={noop}
                    />
                  )}

                  {/* Contact Section */}
                  {section.type === 'contact' && (
                    <ContactSection
                      section={section}
                      editMode={false}
                      updateSectionContent={noop}
                    />
                  )}

                  {/* Quote Section */}
                  {section.type === 'quote' && (
                    <QuoteSection
                      section={section}
                      project={project}
                      editMode={false}
                      updateSectionContent={noop}
                      shareToken={shareToken}
                    />
                  )}

                  {/* Cases Section */}
                  {section.type === 'cases' && (
                    <CasesSection
                      section={section}
                      editMode={false}
                      selectedCaseIds={selectedCaseIds}
                      allCases={caseStudies}
                      updateSectionContent={noop}
                      onCasePickerOpen={noop}
                    />
                  )}

                  {/* Team Section */}
                  {section.type === 'team' && (
                    <TeamSection
                      section={section}
                      editMode={false}
                      allTeamMembers={teamMembers}
                      selectedTeamMemberIds={selectedTeamMemberIds}
                      sectionImages={sectionImages}
                      updateSectionContent={noop}
                      onTeamPickerOpen={noop}
                      onGalleryImageClick={noop}
                    />
                  )}

                  {/* Example Work Section */}
                  {section.type === 'example_work' && (
                    <ExampleWorkSection
                      section={section}
                      editMode={false}
                      collageImages={collageImages}
                      selectedPreset={selectedPreset}
                      updateSectionContent={noop}
                      onImageClick={noop}
                      onOpenPresetPicker={noop}
                    />
                  )}
                </div>
              </section>
            )
          })
        )}
      </div>

      {/* Footer */}
      <footer className="py-12 px-8 bg-background-surface border-t border-border">
        <div className="max-w-5xl mx-auto text-center">
          <Text variant="muted">
            © {new Date().getFullYear()} Lea Films. All rights reserved.
          </Text>
        </div>
      </footer>
    </div>
  )
}

