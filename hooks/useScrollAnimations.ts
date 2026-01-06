import { useEffect, useState, useRef } from 'react'

export function useScrollAnimations(editMode: boolean = false) {
  const [goalSectionProgress, setGoalSectionProgress] = useState(0)
  const goalSectionRef = useRef<HTMLDivElement>(null)
  
  const [timelineSectionProgress, setTimelineSectionProgress] = useState(0)
  const timelineSectionRef = useRef<HTMLDivElement>(null)

  const [conceptSectionProgress, setConceptSectionProgress] = useState(0)
  const conceptSectionRef = useRef<HTMLDivElement>(null)

  const [casesSectionProgress, setCasesSectionProgress] = useState(0)
  const casesSectionRef = useRef<HTMLDivElement>(null)

  // Scroll-based animation for Goal section
  useEffect(() => {
    if (editMode) return

    const handleScroll = () => {
      if (!goalSectionRef.current) return

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

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [editMode])

  // Scroll-based animation for Timeline section with scroll hijacking
  useEffect(() => {
    if (editMode) return

    let accumulatedScroll = 0
    const scrollSpeed = 0.5 // Juster denne for å kontrollere hastighet (lavere = tregere)
    const maxScroll = 500 // Total scroll nødvendig for å fullføre animasjonen
    const slowScrollFactor = 0.5 // Faktor for sakte scrolling (0.1 = 10% av normal hastighet)
    
    // Detekter om vi er på mobil
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768
    
    // For mobil: bruk scroll-basert progress i stedet for hijacking
    let sectionStartScroll = 0
    let sectionEndScroll = 0

    const updateProgress = (delta: number) => {
      accumulatedScroll += delta * scrollSpeed
      accumulatedScroll = Math.max(0, Math.min(maxScroll, accumulatedScroll))
      const newProgress = accumulatedScroll / maxScroll
      setTimelineSectionProgress(newProgress)
    }

    const handleWheel = (e: WheelEvent) => {
      if (!timelineSectionRef.current || isMobile) return

      const element = timelineSectionRef.current
      const rect = element.getBoundingClientRect()
      const windowHeight = window.innerHeight
      
      // Sjekk om tidslinje-seksjonen er i viewport
      const isInViewport = rect.top < windowHeight && rect.bottom > 0
      
      if (!isInViewport) return

      // Beregn nåværende progress basert på scroll-posisjon
      const currentProgress = Math.min(1, Math.max(0, accumulatedScroll / maxScroll))
      
      // Sjekk om vi skal hijack scroll (når animasjonen pågår i begge retninger)
      // Nedover: når progress < 1
      // Oppover: når progress > 0
      const shouldHijack = (e.deltaY > 0 && currentProgress < 1) || (e.deltaY < 0 && currentProgress > 0)
      
      if (shouldHijack) {
        e.preventDefault()
        
        // Akkumuler scroll-verdi for animasjonen (kan være positiv eller negativ)
        updateProgress(e.deltaY)
        
        // La siden scrolle sakte i retningen brukeren scroller (oppover eller nedover)
        // Sett scroll-posisjonen direkte
        const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop
        const slowScrollAmount = e.deltaY * slowScrollFactor
        window.scrollTo({
          top: currentScrollTop + slowScrollAmount,
          behavior: 'auto'
        })
      }
      // Hvis animasjonen er ferdig (progress = 1) og man scroller nedover, eller
      // hvis animasjonen er på start (progress = 0) og man scroller oppover, tillat normal scrolling
    }

    // Throttle scroll updates med requestAnimationFrame
    let rafId: number | null = null
    let lastProgress = -1
    
    const updateProgressIfNeeded = (newProgress: number) => {
      // Bare oppdater hvis endringen er signifikant (mer enn 0.01)
      if (Math.abs(newProgress - lastProgress) > 0.01) {
        lastProgress = newProgress
        setTimelineSectionProgress(newProgress)
      }
    }

    const handleScroll = () => {
      if (!timelineSectionRef.current) return

      // Bruk requestAnimationFrame for å throttling
      if (rafId !== null) {
        return
      }

      rafId = requestAnimationFrame(() => {
        rafId = null
        
        const element = timelineSectionRef.current
        if (!element) return

        const rect = element.getBoundingClientRect()
        const windowHeight = window.innerHeight
        const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop
        
        // Sjekk om tidslinje-seksjonen er i viewport
        const isInViewport = rect.top < windowHeight && rect.bottom > 0
        
        if (isMobile) {
          // På mobil: beregn progress basert på scroll-posisjon gjennom seksjonen
          // Start animasjonen når toppen av seksjonen er 70% ned i viewport
          // Slutt animasjonen når bunnen av seksjonen er 30% opp i viewport
          const startPoint = windowHeight * 0.7  // Start når toppen er 70% ned
          const endPoint = windowHeight * 0.3     // Slutt når bunnen er 30% opp
          
          const sectionTop = rect.top
          const sectionBottom = rect.bottom
          
          // Sjekk om vi er i animasjonsområdet
          const isInAnimationRange = sectionTop < startPoint && sectionBottom > endPoint
          
          if (isInAnimationRange) {
            // Beregn progress: 0 når toppen er ved startPoint, 1 når bunnen er ved endPoint
            // Animasjonsområdet er fra startPoint til endPoint
            const animationRange = startPoint - endPoint
            const currentPosition = startPoint - sectionTop
            const scrollProgress = Math.max(0, Math.min(1, currentPosition / animationRange))
            
            updateProgressIfNeeded(scrollProgress)
          } else if (sectionTop >= startPoint) {
            // Seksjonen er over start-punkt - reset
            if (lastProgress !== 0) {
              lastProgress = 0
              setTimelineSectionProgress(0)
            }
          } else if (sectionBottom <= endPoint) {
            // Seksjonen er under slutt-punkt - fullfør animasjonen
            if (lastProgress !== 1) {
              lastProgress = 1
              setTimelineSectionProgress(1)
            }
          }
        } else {
          // Desktop: bruk accumulated scroll
          if (!isInViewport && rect.top > windowHeight) {
            // Seksjonen er over viewport - reset
            accumulatedScroll = 0
            if (lastProgress !== 0) {
              lastProgress = 0
              setTimelineSectionProgress(0)
            }
          } else if (!isInViewport && rect.bottom < 0) {
            // Seksjonen er under viewport - fullfør animasjonen
            accumulatedScroll = maxScroll
            if (lastProgress !== 1) {
              lastProgress = 1
              setTimelineSectionProgress(1)
            }
          }
        }
      })
    }

    // Bruk wheel event for desktop (kan preventDefault)
    if (!isMobile) {
      window.addEventListener('wheel', handleWheel, { passive: false })
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll, { passive: true })

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
      if (!isMobile) {
        window.removeEventListener('wheel', handleWheel)
      }
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [editMode])

  // Scroll-based animation for Concept section (zoom effect)
  useEffect(() => {
    if (editMode) return

    const handleScroll = () => {
      if (!conceptSectionRef.current) return

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

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [editMode])

  // Scroll-based animation for Cases section
  useEffect(() => {
    if (editMode) return

    // Throttle scroll updates with requestAnimationFrame
    let rafId: number | null = null
    let lastProgress = -1
    
    const updateProgressIfNeeded = (newProgress: number) => {
      // Bare oppdater hvis endringen er signifikant (mer enn 0.01)
      if (Math.abs(newProgress - lastProgress) > 0.01) {
        lastProgress = newProgress
        setCasesSectionProgress(newProgress)
      }
    }

    const handleScroll = () => {
      if (!casesSectionRef.current) return

      // Bruk requestAnimationFrame for å throttling
      if (rafId !== null) {
        return
      }

      rafId = requestAnimationFrame(() => {
        rafId = null
        
        const element = casesSectionRef.current
        if (!element) return

        const rect = element.getBoundingClientRect()
        const windowHeight = window.innerHeight
        
        // Start animasjonen når seksjonen kommer inn i viewport
        const startPoint = windowHeight * 0.7
        // Slutt når seksjonen er forbi viewport
        const endPoint = windowHeight * 0.1
        
        const animationRange = startPoint - endPoint
        const currentPosition = rect.top
        
        let progress = (startPoint - currentPosition) / animationRange
        progress = Math.max(0, Math.min(1, progress))
        
        updateProgressIfNeeded(progress)
      })
    }

    // Initial call to set progress
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll, { passive: true })

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [editMode])

  return {
    goalSectionProgress,
    goalSectionRef,
    timelineSectionProgress,
    timelineSectionRef,
    conceptSectionProgress,
    conceptSectionRef,
    casesSectionProgress,
    casesSectionRef
  }
}

