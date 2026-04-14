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

  // Goal section — slide-in animation
  useEffect(() => {
    if (editMode) return

    const handleScroll = () => {
      if (!goalSectionRef.current) return
      const rect = goalSectionRef.current.getBoundingClientRect()
      const windowHeight = window.innerHeight
      const startPoint = windowHeight * 0.9
      const endPoint = windowHeight * 0.4
      let progress = (startPoint - rect.top) / (startPoint - endPoint)
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

  // Timeline section — sticky scroll pattern
  // The outer ref div is tall (280vh). Progress = how far we've scrolled into it.
  // No wheel hijacking — perfectly smooth native scroll.
  useEffect(() => {
    if (editMode) return

    let rafId: number | null = null

    const handleScroll = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        if (!timelineSectionRef.current) return

        const el = timelineSectionRef.current
        const rect = el.getBoundingClientRect()
        const windowHeight = window.innerHeight
        const totalScrollable = el.offsetHeight - windowHeight

        if (totalScrollable <= 0) return

        // How many pixels we've scrolled past the top of this section
        const scrolledIn = Math.max(0, -rect.top)
        const progress = Math.min(1, scrolledIn / totalScrollable)

        setTimelineSectionProgress(progress)
      })
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll, { passive: true })
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [editMode])

  // Concept section — zoom-in effect
  useEffect(() => {
    if (editMode) return

    const handleScroll = () => {
      if (!conceptSectionRef.current) return
      const rect = conceptSectionRef.current.getBoundingClientRect()
      const windowHeight = window.innerHeight
      const startPoint = windowHeight
      const endPoint = windowHeight * 0.1
      let progress = (startPoint - rect.top) / (startPoint - endPoint)
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

  // Cases section
  useEffect(() => {
    if (editMode) return

    let rafId: number | null = null

    const handleScroll = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        if (!casesSectionRef.current) return
        const rect = casesSectionRef.current.getBoundingClientRect()
        const windowHeight = window.innerHeight
        const startPoint = windowHeight * 0.8
        const endPoint = windowHeight * 0.1
        let progress = (startPoint - rect.top) / (startPoint - endPoint)
        progress = Math.max(0, Math.min(1, progress))
        setCasesSectionProgress(progress)
      })
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll, { passive: true })
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
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
    casesSectionRef,
  }
}
