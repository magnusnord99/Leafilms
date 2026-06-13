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
  const navRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    // Komponenten rendrer null når !isDesktop, og handleScroll() setter riktig
    // synlighet ved re-subscribe — ingen grunn til setState her
    if (!isDesktop) return
    const handleScroll = () => {
      if (window.scrollY > 200) {
        setIsVisible(true)
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
        scrollTimeoutRef.current = setTimeout(() => {
          setIsVisible(false)
          setIsExpanded(false)
        }, 2200)
      } else {
        setIsVisible(false)
        setIsExpanded(false)
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    }
  }, [isDesktop])

  useEffect(() => {
    if (!isDesktop) return
    const handleScroll = () => {
      const scrollPosition = window.scrollY + window.innerHeight * 0.3
      let current: string | null = null
      sections.forEach(section => {
        const el = document.querySelector(`[data-section-id="${section.id}"]`)
        if (el) {
          const rect = el.getBoundingClientRect()
          const top = rect.top + window.scrollY
          if (scrollPosition >= top && scrollPosition < top + rect.height) current = section.id
        }
      })
      setActiveSectionId(current)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [sections, isDesktop])

  useEffect(() => {
    if (!isExpanded || !isDesktop) return
    const handleClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setIsExpanded(false)
      }
    }
    const t = setTimeout(() => document.addEventListener('mousedown', handleClick), 100)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [isExpanded, isDesktop])

  const scrollToSection = (sectionId: string) => {
    const el = document.querySelector(`[data-section-id="${sectionId}"]`)
    if (el) {
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 60, behavior: 'smooth' })
    }
  }

  const visibleSections = sections.filter(s => s.type !== 'hero' && s.visible)
  if (!isDesktop || visibleSections.length === 0) return null

  return (
    <div
      ref={navRef}
      className="fixed left-0 top-1/2 -translate-y-1/2 z-50"
      style={{
        transition: 'opacity 0.3s, transform 0.3s',
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(-50%) translateX(0)' : 'translateY(-50%) translateX(-100%)',
        pointerEvents: isVisible ? 'auto' : 'none',
      }}
    >
      {!isExpanded ? (
        <button
          onClick={() => setIsExpanded(true)}
          className="flex items-center justify-center transition-all"
          title="Vis navigasjon"
          style={{
            width: 36,
            height: 36,
            background: '#161410',
            border: '1px solid #2A261F',
            borderLeft: 'none',
            borderTopRightRadius: 3,
            borderBottomRightRadius: 3,
          }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="#9E9287" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      ) : (
        <nav
          style={{
            background: '#161410',
            border: '1px solid #2A261F',
            borderLeft: 'none',
            borderTopRightRadius: 3,
            borderBottomRightRadius: 3,
            padding: '8px 0',
            maxHeight: '80vh',
            overflowY: 'auto',
            minWidth: 140,
          }}
        >
          {/* Close row */}
          <div className="px-3 pb-2 flex justify-between items-center">
            <span style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.55rem',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#38332A',
            }}>
              SEKSJONER
            </span>
            <button
              onClick={() => setIsExpanded(false)}
              style={{
                color: '#62594E',
                fontSize: '0.6rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                fontFamily: 'var(--font-dm-sans)',
                lineHeight: 1,
                padding: '2px 4px',
              }}
            >
              ×
            </button>
          </div>
          <div style={{ height: 1, background: '#2A261F', margin: '0 12px 4px' }} />
          <ul>
            {visibleSections.map((section) => {
              const isActive = activeSectionId === section.id
              return (
                <li key={section.id}>
                  <button
                    onClick={() => scrollToSection(section.id)}
                    className="w-full text-left px-4 py-2 flex items-center gap-2.5 transition-all group hover:bg-[#201D18]"
                    style={{ fontFamily: 'var(--font-dm-sans)' }}
                  >
                    <span style={{
                      width: isActive ? 14 : 4,
                      height: 1,
                      background: isActive ? '#C49434' : '#38332A',
                      transition: 'all 0.2s',
                      flexShrink: 0,
                    }} />
                    <span
                      className="group-hover:text-[#9E9287]"
                      style={{
                        fontSize: '0.6rem',
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: isActive ? '#E8E1D5' : '#62594E',
                        transition: 'color 0.2s',
                        whiteSpace: 'nowrap',
                      }}>
                      {getSectionTitle(section.type)}
                    </span>
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
