'use client'

import { Section, CaseStudy } from '@/lib/types'
import { Button, Heading, Text } from '@/components/ui'
import React, { useRef, useEffect, useState, useMemo } from 'react'

type CasesSectionProps = {
  section: Section
  editMode: boolean
  allCases: CaseStudy[]
  selectedCaseIds: string[]
  updateSectionContent: (sectionId: string, key: string, value: string | any) => void
  onCasePickerOpen: () => void
  casesSectionProgress?: number
  casesSectionRef?: React.RefObject<HTMLDivElement>
}

export function CasesSection({
  section,
  editMode,
  allCases,
  selectedCaseIds,
  updateSectionContent,
  onCasePickerOpen,
  casesSectionProgress = 0,
  casesSectionRef
}: CasesSectionProps) {
  const internalRef = useRef<HTMLDivElement>(null)
  const sectionRef = casesSectionRef || internalRef
  const [isMounted, setIsMounted] = useState(false)
  
  // Set mounted flag after component mounts on client
  useEffect(() => {
    setIsMounted(true)
  }, [])
  
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
    switch (index) {
      case 0: // Top left
        return { x: -windowWidth * 0.6, y: -windowHeight * 0.6 }
      case 1: // Top right
        return { x: windowWidth * 0.6, y: -windowHeight * 0.6 }
      case 2: // Bottom left
        return { x: -windowWidth * 0.6, y: windowHeight * 0.6 }
      case 3: // Bottom right
        return { x: windowWidth * 0.6, y: windowHeight * 0.6 }
      default:
        return { x: 0, y: 0 }
    }
  }, [isMounted])
  
  // Debug: log progress changes (only in development)
  useEffect(() => {
    if (!editMode && process.env.NODE_ENV === 'development') {
      console.log('[CasesSection] Progress:', casesSectionProgress.toFixed(2), 'Ref:', sectionRef.current !== null)
    }
  }, [casesSectionProgress, editMode, sectionRef])

  return (
    <div ref={sectionRef} className="relative -mt-24 mb-30 pt-24">
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
            const scale = editMode ? 1 : 0.8 + (easedProgress * 0.2) // Start at 80% scale, animate to 100%
            
            return (
              <div 
                key={caseId} 
                className="text-center"
                style={{
                  transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`,
                  opacity: opacity,
                  willChange: editMode ? 'auto' : 'transform, opacity',
                  transition: editMode ? 'transform 0.3s ease-out, opacity 0.3s ease-out' : 'none'
                }}
              >
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

