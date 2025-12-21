import { useEffect, useState, useRef } from 'react'

export function useScrollAnimations(editMode: boolean) {
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

  // Scroll-based animation for Timeline section
  useEffect(() => {
    if (editMode) return

    const handleScroll = () => {
      if (!timelineSectionRef.current) return

      const element = timelineSectionRef.current
      const rect = element.getBoundingClientRect()
      const windowHeight = window.innerHeight
      
      const startPoint = windowHeight * 0.8
      const endPoint = -rect.height *0.002
      
      const animationRange = startPoint - endPoint
      const currentPosition = rect.top
      
      let progress = (startPoint - currentPosition) / animationRange
      progress = Math.max(0, Math.min(1, progress))
      
      setTimelineSectionProgress(progress)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll, { passive: true })

    return () => {
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

