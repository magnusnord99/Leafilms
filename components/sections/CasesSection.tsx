'use client'

import { Section, CaseStudy } from '@/lib/types'
import { Button } from '@/components/ui'
import React, { useRef, useSyncExternalStore } from 'react'

// Stabil no-op subscribe for hydreringsdetektoren under
function emptySubscribe() {
  return () => {}
}

type CasesSectionProps = {
  section: Section
  editMode: boolean
  language?: 'no' | 'en'
  allCases: CaseStudy[]
  selectedCaseIds: string[]
  getSectionTitle?: (type: string) => string
  updateSectionContent: (sectionId: string, key: string, value: unknown) => void
  onCasePickerOpen: () => void
  casesSectionProgress?: number
  casesSectionRef?: React.RefObject<HTMLDivElement | null>
}

export function CasesSection({
  section,
  editMode,
  language = 'no',
  allCases,
  selectedCaseIds,
  getSectionTitle,
  updateSectionContent,
  onCasePickerOpen,
  casesSectionProgress = 0,
  casesSectionRef
}: CasesSectionProps) {
  const internalRef = useRef<HTMLDivElement>(null)
  const sectionRef = casesSectionRef || internalRef
  // Hydreringsdetektor: false på server/første render, true på klient etter mount
  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )
  
  // Easing function for smoother animation (ease-out cubic)
  const easeOutCubic = React.useCallback((t: number) => {
    return 1 - Math.pow(1 - t, 3)
  }, [])
  
  // Calculate starting positions for each corner - only on client after mount
  const getStartingPosition = React.useCallback((index: number) => {
    if (!isMounted || typeof window === 'undefined') {
      // Return neutral positions during SSR and initial render
      return { x: 0, y: 0 }
    }
    
    const windowWidth = window.innerWidth
    const windowHeight = window.innerHeight
    const isMobile = windowWidth < 768

    if (isMobile) {
      // On mobile, all cards stack vertically, so they all start from top
      return { x: 0, y: -windowHeight * 0.8 }
    }

    // Desktop: 4 corners - use larger offsets for more dramatic effect
    // Juster verdien: høyere (f.eks. 0.3) = mer flytting, lavere (f.eks. 0.05) = mindre flytting
    const offsetFactor = 0.1 // Redusert fra 0.2 for mindre flytting
    
    switch (index) {
      case 0: // Top left
        return { x: -windowWidth * offsetFactor, y: -windowHeight * offsetFactor }
      case 1: // Top right
        return { x: windowWidth * offsetFactor, y: -windowHeight * offsetFactor }
      case 2: // Bottom left
        return { x: -windowWidth * offsetFactor, y: windowHeight * offsetFactor }
      case 3: // Bottom right
        return { x: windowWidth * offsetFactor, y: windowHeight * offsetFactor }
      default:
        return { x: 0, y: 0 }
    }
  }, [isMounted])
  

  return (
    <div ref={sectionRef} className="py-16 md:py-20 px-8 md:px-16">
      {/* Section header */}
      <div className="mb-10">
        <div className="flex items-center gap-4 mb-5">
          <div style={{ width: 32, height: 1, background: '#C49434' }} />
          <span
            className={editMode ? 'edit-outline px-2 py-1' : ''}
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.78rem',
              letterSpacing: '0.16em',
              color: '#C49434',
              textTransform: 'uppercase',
              fontWeight: 500,
            }}
            contentEditable={editMode}
            suppressContentEditableWarning
            onBlur={(e) => {
              if (editMode) updateSectionContent(section.id, 'title', e.currentTarget.textContent || '')
            }}
          >
            {section.content.title || (getSectionTitle ? getSectionTitle(section.type) : 'Eksempelarbeid')}
          </span>
        </div>
        <p
          className={editMode ? 'edit-outline px-2 py-1' : ''}
          style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: 'clamp(1.75rem, 2.8vw, 2.5rem)',
            fontWeight: 300,
            fontStyle: 'italic',
            color: '#E8E1D5',
            lineHeight: 1.3,
          }}
          contentEditable={editMode}
          suppressContentEditableWarning
          onBlur={(e) => {
            if (editMode) updateSectionContent(section.id, 'description', e.currentTarget.textContent || '')
          }}
        >
          {section.content.description || (language === 'en' ? 'A selection of our previous work' : 'Se utvalg av våre tidligere prosjekter')}
        </p>
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
          {selectedCaseIds.map((caseId, index) => {
            const caseStudy = allCases.find(c => c.id === caseId)
            if (!caseStudy) return null
            
            // Extract Vimeo ID from URL
            const getVimeoId = (url: string): string | null => {
              const match = url.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/)
              return match ? match[1] : null
            }
            
            const vimeoId = caseStudy.vimeo_id || getVimeoId(caseStudy.vimeo_url)
            
            // Calculate animation transform
            const startPos = getStartingPosition(index)
            const progress = editMode ? 1 : (isMounted ? Math.max(0, Math.min(1, casesSectionProgress)) : 0)
            const easedProgress = editMode ? 1 : easeOutCubic(progress)
            
            // Calculate transform values
            const translateX = startPos.x * (1 - easedProgress)
            const translateY = startPos.y * (1 - easedProgress)
            const opacity = editMode ? 1 : progress
            
            // Scale animation: start at minScale, animate to 100%
            // Juster minScale (f.eks. 0.5 = 50%, 0.6 = 60%, 0.8 = 80%) for å endre startstørrelsen
            const minScale = 0.9 // Juster denne for å endre hvor små objektene er i starten
            const scale = editMode ? 1 : minScale + (easedProgress * (1 - minScale))
            
            return (
              <div
                key={caseId}
                style={{
                  transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`,
                  opacity: opacity,
                  willChange: editMode ? 'auto' : 'transform, opacity',
                  transition: editMode ? 'transform 0.3s ease-out, opacity 0.3s ease-out' : 'none',
                }}
              >
                {/* Video / thumbnail container */}
                <div
                  className="aspect-video overflow-hidden mb-0"
                  style={{ background: '#0C0B09' }}
                >
                  {vimeoId ? (
                    <iframe
                      src={`https://player.vimeo.com/video/${vimeoId}?title=0&byline=0&portrait=0&color=C49434`}
                      className="w-full h-full"
                      frameBorder="0"
                      allow="autoplay; fullscreen; picture-in-picture"
                      allowFullScreen
                      title={caseStudy.title}
                    />
                  ) : caseStudy.thumbnail_path ? (
                    <img
                      src={caseStudy.thumbnail_path}
                      alt={caseStudy.title}
                      className="w-full h-full object-cover"
                      style={{ filter: 'brightness(0.9) saturate(0.85)' }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ background: '#161410' }}>
                      <svg className="w-10 h-10" style={{ color: '#2A261F' }} fill="currentColor" viewBox="0 0 20 20">
                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Case title */}
                {caseStudy.title && (
                  <div className="pt-3 pb-1">
                    <p style={{
                      fontFamily: 'var(--font-cormorant)',
                      fontSize: 'clamp(0.95rem, 1.2vw, 1.1rem)',
                      fontWeight: 400,
                      fontStyle: 'italic',
                      color: '#9E9287',
                      letterSpacing: '0.01em',
                    }}>
                      {caseStudy.title}
                    </p>
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

