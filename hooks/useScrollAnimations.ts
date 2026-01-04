import { useEffect, useState, useRef } from 'react'

export function useScrollAnimations(editMode: boolean = false) {
  const [goalSectionProgress, setGoalSectionProgress] = useState(0)
  const goalSectionRef = useRef<HTMLDivElement>(null)
  
  const [timelineSectionProgress, setTimelineSectionProgress] = useState(0)
  const timelineSectionRef = useRef<HTMLDivElement>(null)

  const [conceptSectionProgress, setConceptSectionProgress] = useState(0)
  const conceptSectionRef = useRef<HTMLDivElement>(null)

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

    const handleWheel = (e: WheelEvent) => {
      if (!timelineSectionRef.current) return

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
        accumulatedScroll += e.deltaY * scrollSpeed
        accumulatedScroll = Math.max(0, Math.min(maxScroll, accumulatedScroll))
        
        // Oppdater progress
        const newProgress = accumulatedScroll / maxScroll
        setTimelineSectionProgress(newProgress)
        
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

    const handleScroll = () => {
      if (!timelineSectionRef.current) return

      const element = timelineSectionRef.current
      const rect = element.getBoundingClientRect()
      const windowHeight = window.innerHeight
      
      // Hvis seksjonen ikke er i viewport, reset accumulated scroll
      const isInViewport = rect.top < windowHeight && rect.bottom > 0
      
      if (!isInViewport && rect.top > windowHeight) {
        // Seksjonen er over viewport - reset
        accumulatedScroll = 0
        setTimelineSectionProgress(0)
      } else if (!isInViewport && rect.bottom < 0) {
        // Seksjonen er under viewport - fullfør animasjonen
        accumulatedScroll = maxScroll
        setTimelineSectionProgress(1)
      }
    }

    // Bruk wheel event for bedre kontroll (kan preventDefault)
    window.addEventListener('wheel', handleWheel, { passive: false })
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('wheel', handleWheel)
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

  return {
    goalSectionProgress,
    goalSectionRef,
    timelineSectionProgress,
    timelineSectionRef,
    conceptSectionProgress,
    conceptSectionRef
  }
}

