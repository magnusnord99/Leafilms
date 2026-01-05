'use client'

import { useEffect, useState, useRef } from 'react'
import { Section } from '@/lib/types'

interface SectionNavigationProps {
  sections: Section[]
  getSectionTitle: (type: string) => string
}

export function SectionNavigation({ sections, getSectionTitle }: SectionNavigationProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [isDesktop, setIsDesktop] = useState(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Check if desktop on mount and resize
  useEffect(() => {
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= 768) // md breakpoint
    }
    checkDesktop()
    window.addEventListener('resize', checkDesktop)
    return () => window.removeEventListener('resize', checkDesktop)
  }, [])

  // Show navigation when scrolled down, hide when stopped scrolling (only on desktop)
  useEffect(() => {
    if (!isDesktop) {
      setIsVisible(false)
      return
    }

    const handleScroll = () => {
      const scrollY = window.scrollY
      
      // Show navigation after scrolling 200px
      if (scrollY > 200) {
        setIsVisible(true)
        
        // Clear existing timeout
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current)
        }
        
        // Hide navigation after 2 seconds of no scrolling
        scrollTimeoutRef.current = setTimeout(() => {
          setIsVisible(false)
          setIsExpanded(false) // Also collapse when hiding
        }, 2000)
      } else {
        // Hide immediately if scrolled back to top
        setIsVisible(false)
        setIsExpanded(false)
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current)
        }
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll() // Check initial state

    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [isDesktop])

  // Track which section is currently active based on scroll position
  useEffect(() => {
    if (!isDesktop) return

    const handleScroll = () => {
      const scrollPosition = window.scrollY + window.innerHeight * 0.3 // Offset for better UX

      // Find the section that's currently in view
      let currentSection: string | null = null
      
      sections.forEach(section => {
        const element = document.querySelector(`[data-section-id="${section.id}"]`)
        if (element) {
          const rect = element.getBoundingClientRect()
          const elementTop = rect.top + window.scrollY
          const elementBottom = elementTop + rect.height

          if (scrollPosition >= elementTop && scrollPosition < elementBottom) {
            currentSection = section.id
          }
        }
      })

      setActiveSectionId(currentSection)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll() // Check initial state

    return () => window.removeEventListener('scroll', handleScroll)
  }, [sections, isDesktop])

  // Scroll to section smoothly
  const scrollToSection = (sectionId: string) => {
    const element = document.querySelector(`[data-section-id="${sectionId}"]`)
    if (element) {
      const rect = element.getBoundingClientRect()
      const offset = 80 // Offset from top
      const targetPosition = rect.top + window.scrollY - offset

      window.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
      })
    }
  }

  // Filter out hero section and only show visible sections
  const visibleSections = sections.filter(s => s.type !== 'hero' && s.visible)

  // Don't render if not desktop or no sections
  if (!isDesktop || visibleSections.length === 0) {
    return null
  }

  return (
    <div
      className={`fixed left-0 top-1/2 -translate-y-1/2 z-50 transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-full pointer-events-none'
      }`}
    >
      {!isExpanded ? (
        // Collapsed state - just show expand button
        <button
          onClick={() => setIsExpanded(true)}
          className="bg-background-widget-dark/95 backdrop-blur-sm border-r border-border rounded-r-lg shadow-xl p-3 ml-4 hover:bg-background-widget-dark transition-colors"
          title="Vis navigasjon"
        >
          <svg
            className="w-5 h-5 text-foreground/70 hover:text-foreground transition-colors"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
      ) : (
        // Expanded state - show full navigation
        <nav className="bg-background-widget-dark/95 backdrop-blur-sm border-r border-border rounded-r-lg shadow-xl p-3 ml-4 max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
              Navigasjon
            </span>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1 rounded hover:bg-background-widget-dark/50 transition-colors"
              title="Skjul navigasjon"
            >
              <svg
                className="w-4 h-4 text-foreground/70 hover:text-foreground transition-colors"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <ul className="space-y-1.5">
            {visibleSections.map((section) => {
              const isActive = activeSectionId === section.id
              const title = getSectionTitle(section.type)
              
              return (
                <li key={section.id}>
                  <button
                    onClick={() => scrollToSection(section.id)}
                    className={`
                      w-full text-left px-3 py-2 rounded-md transition-all duration-200
                      text-xs font-medium whitespace-nowrap
                      ${
                        isActive
                          ? 'bg-background-widget-red text-white shadow-md'
                          : 'text-foreground/70 hover:text-foreground hover:bg-background-widget-dark/50'
                      }
                    `}
                    title={title}
                  >
                    {title}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      )}
    </div>
  )
}

