'use client'

import { Project, Section, TeamMember, CaseStudy, Image, SectionImage, VideoLibrary, SectionVideo, CollagePreset } from '@/lib/types'
import { Text } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useMemo, useCallback, useEffect } from 'react'
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
  QuoteSection,
  FullImageSection,
  CollageImages,
  ProductionScheduleSection
} from '@/components/sections'
import { useProjectAnalytics } from '@/hooks/useProjectAnalytics'
import { useScrollAnimations } from '@/hooks/useScrollAnimations'
import { useAuth } from '@/hooks/useAuth'
import { SectionNavigation } from '@/components/project'

// Helper for å hente bilde-URL
function getImageUrl(filePath: string): string {
  return supabase.storage.from('assets').getPublicUrl(filePath).data.publicUrl
}

type PublicProjectClientProps = {
  project: Project
  sections: Section[]
  sectionImages: Record<string, Image[]>
  sectionImageData: Record<string, SectionImage[]>
  sectionVideos?: Record<string, VideoLibrary[]>
  sectionVideoData?: Record<string, SectionVideo[]>
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
  sectionVideos = {},
  sectionVideoData = {},
  teamMembers,
  caseStudies,
  collageImages,
  selectedPreset,
  shareToken
}: PublicProjectClientProps) {
  // Always call hooks in the same order - useMemo to ensure stable sectionIds
  const sectionIds = useMemo(() => sections.map(s => s.id), [sections])
  
  // Check if user is admin - must be called before other hooks that depend on it
  const { isAdmin, loading: authLoading } = useAuth()

  // Use scroll animations hook (editMode = false for public view)
  const {
    goalSectionProgress,
    goalSectionRef,
    timelineSectionProgress,
    timelineSectionRef,
    conceptSectionProgress,
    conceptSectionRef,
    casesSectionProgress,
    casesSectionRef
  } = useScrollAnimations(false)

  // Disable tracking while auth is loading (unknown user) or when user is admin
  useProjectAnalytics(project.id, shareToken, sectionIds, isAdmin || authLoading)

  // Scroll-reveal: apply .is-visible to .section-reveal elements when they enter viewport
  useEffect(() => {
    const targets = document.querySelectorAll('.section-reveal')
    if (!targets.length) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    )
    targets.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [sections])

  // Hjelpefunksjoner
  const sectionTitles = {
    no: {
      hero: 'HERO', goal: 'MÅL', concept: 'KONSEPT', cases: 'TIDLIGERE ARBEID',
      moodboard: 'MOODBOARD', timeline: 'TIDSLINJE', deliverables: 'LEVERING',
      contact: 'KONTAKT', team: 'TEAM', example_work: 'EKSEMPELARBEID',
      quote: 'PRISTILBUD', full_image: 'BILDE', production_schedule: 'PRODUKSJONSPLAN'
    },
    en: {
      hero: 'HERO', goal: 'GOAL', concept: 'CONCEPT', cases: 'PREVIOUS WORK',
      moodboard: 'MOODBOARD', timeline: 'TIMELINE', deliverables: 'DELIVERABLES',
      contact: 'CONTACT', team: 'TEAM', example_work: 'EXAMPLE WORK',
      quote: 'QUOTE', full_image: 'IMAGE', production_schedule: 'PRODUCTION SCHEDULE'
    }
  } as const
  const lang = project.language === 'en' ? 'en' : 'no'

  const getSectionTitle = useCallback((type: string) =>
    sectionTitles[lang][type as keyof typeof sectionTitles.no] || type.toUpperCase()
  , [lang]) // eslint-disable-line react-hooks/exhaustive-deps

  const getBackgroundStyle = useCallback((sectionId: string, imageIndex = 0): React.CSSProperties => {
    const images = sectionImages[sectionId]
    const imageData = sectionImageData[sectionId]

    if (!images || !images[imageIndex]) return {}

    const image = images[imageIndex]
    const data = imageData?.[imageIndex]

    const posX = data?.background_position_x ?? 50
    const posY = data?.background_position_y ?? 50
    const zoom = data?.background_zoom

    const backgroundSize = zoom === null || zoom === undefined || zoom === 1.0
      ? 'cover'
      : `${zoom * 100}%`

    return {
      backgroundImage: `url(${getImageUrl(image.file_path)})`,
      backgroundSize: backgroundSize,
      backgroundPosition: `${posX}% ${posY}%`,
      backgroundRepeat: 'no-repeat'
    }
  }, [sectionImages, sectionImageData])

  // Stable noop functions (view mode — not used for mutations)
  const noop = useCallback(() => {}, [])
  const noopAsync = useCallback(async () => {}, [])
  const noopEvent = useCallback((e: React.MouseEvent) => { e.stopPropagation() }, [])

  // Stable empty objects — avoids creating new references on every render
  const emptyImagePosition = useMemo(() => ({}), [])
  const emptyRecord = useMemo(() => ({}), [])

  const heroSection = useMemo(() => sections.find(s => s.type === 'hero'), [sections])
  const exampleWorkSection = useMemo(() => sections.find(s => s.type === 'example_work'), [sections])

  useEffect(() => {
    if (!exampleWorkSection) return
  }, [exampleWorkSection, sectionImageData, collageImages])

  const sortedNonHeroSections = useMemo(() =>
    sections
      .filter(s => s.type !== 'hero')
      .sort((a, b) => {
        if (a.type === 'contact' && b.type !== 'contact') return 1
        if (a.type !== 'contact' && b.type === 'contact') return -1
        return a.order_index - b.order_index
      }),
    [sections]
  )

  // selectedTeamMemberIds og selectedCaseIds skal komme fra props, ikke fra section.content
  // (de er allerede filtrert i page.tsx)
  const selectedTeamMemberIds = useMemo(() => teamMembers.map(m => m.id), [teamMembers])
  const selectedCaseIds = useMemo(() => caseStudies.map(c => c.id), [caseStudies])

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
      {/* Section Navigation (desktop only, shows on scroll) */}
      <SectionNavigation sections={sections} getSectionTitle={getSectionTitle} />
      
      {/* Hero Section */}
      {heroSection && (
        <div data-section-id={heroSection.id}>
          <HeroSection
            section={heroSection}
            project={project}
            editMode={false}
            sectionImages={sectionImages}
            sectionImageData={sectionImageData}
            sectionVideos={sectionVideos}
            sectionVideoData={sectionVideoData}
            editingImageSectionId={null}
            imagePosition={emptyImagePosition}
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
          sortedNonHeroSections
            .map((section) => {
              if (!section.visible) return null
            
            // Sections with their own scroll animations or sticky behavior don't need section-reveal
            const noReveal = section.type === 'concept' || section.type === 'full_image' || section.type === 'hero' || section.type === 'timeline'

            // Sections that manage their own vertical padding internally (avoid double-padding)
            const selfPadded = section.type === 'cases' || section.type === 'moodboard' || section.type === 'team'
              || section.type === 'quote' || section.type === 'contact' || section.type === 'production_schedule'

            // Build outer section className
            const sectionClass = (() => {
              if (section.type === 'concept') return 'min-h-screen flex flex-col items-center justify-center px-0'
              if (section.type === 'full_image') return 'px-0 py-0'
              if (section.type === 'timeline') return 'px-0'
              if (section.type === 'deliverables') return 'py-section px-0 md:px-4'
              if (selfPadded) return 'px-0'
              return 'py-section px-2 md:px-4'
            })()

            const bgClass = section.type === 'cases' || section.type === 'full_image' ? 'bg-transparent' : 'bg-background'
            const revealClass = noReveal ? '' : ' section-reveal'

            return (
              <section
                key={section.id}
                data-section-id={section.id}
                className={`${sectionClass} ${bgClass} relative${revealClass}`}
              >
                <div className={section.type === 'team' || section.type === 'concept' || section.type === 'deliverables' || section.type === 'example_work' || section.type === 'full_image' || section.type === 'cases' || section.type === 'moodboard' || section.type === 'quote' || section.type === 'contact' || section.type === 'timeline' || section.type === 'production_schedule' ? 'w-full' : 'max-w-7xl mx-auto'}>
                  {/* Concept Section */}
                  {section.type === 'concept' && (
                    <ConceptSection
                      section={section}
                      editMode={false}
                      sectionImages={sectionImages}
                      sectionImageData={sectionImageData}
                      editingImageSectionId={null}
                      imagePosition={emptyImagePosition}
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
                      imagePosition={emptyImagePosition}
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
                      language={lang}
                      sectionImages={sectionImages}
                      sectionImageData={sectionImageData}
                      editingImageSectionId={null}
                      imagePosition={emptyImagePosition}
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
                      getSectionTitle={getSectionTitle}
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
                      getSectionTitle={getSectionTitle}
                      updateSectionContent={noop}
                      onCasePickerOpen={noop}
                      casesSectionProgress={casesSectionProgress}
                      casesSectionRef={casesSectionRef}
                    />
                  )}

                  {/* Team Section */}
                  {section.type === 'team' && (
                    <TeamSection
                      section={section}
                      editMode={false}
                      language={lang}
                      allTeamMembers={teamMembers}
                      selectedTeamMemberIds={selectedTeamMemberIds}
                      sectionImages={sectionImages}
                      getSectionTitle={getSectionTitle}
                      updateSectionContent={noop}
                      onTeamPickerOpen={noop}
                      onGalleryImageClick={noop}
                    />
                  )}

                  {/* Full Image Section */}
                  {section.type === 'full_image' && (
                    <FullImageSection
                      section={section}
                      editMode={false}
                      sectionImages={sectionImages}
                      sectionImageData={sectionImageData}
                      editingImageSectionId={null}
                      imagePosition={emptyImagePosition}
                      getBackgroundStyle={getBackgroundStyle}
                      saveBackgroundPosition={noopAsync}
                      setImagePosition={noop}
                      onImageClick={noop}
                      onEditPositionClick={noopEvent}
                      onImagePickerOpen={noop}
                    />
                  )}

                  {/* Example Work Section */}
                  {section.type === 'example_work' && (
                    <ExampleWorkSection
                      section={section}
                      editMode={false}
                      collageImages={collageImages}
                      selectedPreset={selectedPreset}
                      sectionImageData={sectionImageData}
                      imagePosition={emptyImagePosition}
                      setImagePosition={noop}
                      saveBackgroundPosition={noopAsync}
                      updateSectionContent={noop}
                      onImageClick={noop}
                      onOpenPresetPicker={noop}
                    />
                  )}

                  {/* Production Schedule Section */}
                  {section.type === 'production_schedule' && (
                    <ProductionScheduleSection
                      section={section}
                      editMode={false}
                      updateSectionContent={noop}
                    />
                  )}
                </div>
              </section>
            )
          })
        )}
      </div>

      {/* Footer */}
      <footer className="py-8 px-8" style={{ background: '#0C0B09', borderTop: '1px solid #1A1713' }}>
        <div className="max-w-5xl mx-auto flex items-center justify-center gap-6">
          <div style={{ flex: 1, maxWidth: 120, height: 1, background: '#1A1713' }} />
          <span style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.55rem',
            letterSpacing: '0.22em',
            color: '#38332A',
            textTransform: 'uppercase',
          }}>
            {new Date().getFullYear()} — Leafilms
          </span>
          <div style={{ flex: 1, maxWidth: 120, height: 1, background: '#1A1713' }} />
        </div>
      </footer>
    </div>
  )
}

