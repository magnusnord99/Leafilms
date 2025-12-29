'use client'

import { useEffect, useRef, useState } from 'react'

interface SectionTime {
  sectionId: string
  startTime: number
  accumulatedTime: number
}

interface AnalyticsData {
  projectId: string
  shareToken: string
  sessionStartedAt: string
  sectionTimes: Record<string, number>
  totalTimeSeconds: number
  visibilityChanges: number
  isActive: boolean
}

/**
 * Hook for tracking analytics on public project pages
 * Tracks:
 * - Total time on page
 * - Time spent per section (when section is visible)
 * - Page visibility changes
 */
export function useProjectAnalytics(projectId: string, shareToken: string, sectionIds: string[]) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const sessionStartTime = useRef<number>(Date.now())
  const sectionTimers = useRef<Map<string, SectionTime>>(new Map())
  const visibilityChanges = useRef<number>(0)
  const isActive = useRef<boolean>(true)
  const lastActiveTime = useRef<number>(Date.now())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const sendIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize section timers
  useEffect(() => {
    sectionIds.forEach(sectionId => {
      sectionTimers.current.set(sectionId, {
        sectionId,
        startTime: 0,
        accumulatedTime: 0
      })
    })
  }, [sectionIds])

  // Track page visibility (when user switches tabs, minimizes window, etc.)
  useEffect(() => {
    const handleVisibilityChange = () => {
      const now = Date.now()
      
      if (document.hidden) {
        // Page became hidden - pause all active timers
        isActive.current = false
        visibilityChanges.current++
        
        // Pause all active section timers
        sectionTimers.current.forEach((timer, sectionId) => {
          if (timer.startTime > 0) {
            timer.accumulatedTime += (now - timer.startTime)
            timer.startTime = 0
          }
        })
      } else {
        // Page became visible - resume timers
        isActive.current = true
        lastActiveTime.current = now
        
        // Resume timers for visible sections
        sectionIds.forEach(sectionId => {
          const element = document.querySelector(`[data-section-id="${sectionId}"]`)
          if (element) {
            const rect = element.getBoundingClientRect()
            const isVisible = rect.top < window.innerHeight && rect.bottom > 0
            
            if (isVisible) {
              const timer = sectionTimers.current.get(sectionId)
              if (timer) {
                timer.startTime = now
              }
            }
          }
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [sectionIds])

  // Track section visibility using IntersectionObserver
  useEffect(() => {
    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          const now = Date.now()
          
          entries.forEach(entry => {
            const sectionId = entry.target.getAttribute('data-section-id')
            if (!sectionId) return
            
            const timer = sectionTimers.current.get(sectionId)
            if (!timer) return
            
            if (entry.isIntersecting && isActive.current) {
              // Section became visible - start timer
              if (timer.startTime === 0) {
                timer.startTime = now
              }
            } else {
              // Section became hidden - stop timer and accumulate
              if (timer.startTime > 0) {
                timer.accumulatedTime += (now - timer.startTime) / 1000 // Convert to seconds
                timer.startTime = 0
              }
            }
          })
        },
        {
          threshold: 0.5, // Section is considered visible when 50% is in viewport
          rootMargin: '0px'
        }
      )
    }

    // Observe all sections
    sectionIds.forEach(sectionId => {
      const element = document.querySelector(`[data-section-id="${sectionId}"]`)
      if (element && observerRef.current) {
        observerRef.current.observe(element)
      }
    })

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [sectionIds])

  // Send analytics data periodically (every 30 seconds) and on page unload
  useEffect(() => {
    const sendAnalytics = async (isFinal = false) => {
      const now = Date.now()
      const totalTimeSeconds = Math.floor((now - sessionStartTime.current) / 1000)
      
      // Calculate final times for all sections
      const sectionTimes: Record<string, number> = {}
      sectionTimers.current.forEach((timer, sectionId) => {
        let time = timer.accumulatedTime
        if (timer.startTime > 0 && isActive.current) {
          // Add current active time
          time += (now - timer.startTime) / 1000
        }
        sectionTimes[sectionId] = Math.floor(time)
      })

      const analyticsData: AnalyticsData = {
        projectId,
        shareToken,
        sessionStartedAt: new Date(sessionStartTime.current).toISOString(),
        sectionTimes,
        totalTimeSeconds,
        visibilityChanges: visibilityChanges.current,
        isActive: isActive.current
      }

      try {
        const response = await fetch('/api/analytics/track', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ...analyticsData,
            sessionId,
            isFinal
          }),
          // Don't wait for response on page unload
          keepalive: isFinal
        })

        if (response.ok && !sessionId) {
          const data = await response.json()
          if (data.sessionId) {
            setSessionId(data.sessionId)
          }
        }
      } catch (error) {
        // Silently fail - analytics should not break the user experience
        console.error('Analytics tracking error:', error)
      }
    }

    // Send analytics every 30 seconds
    sendIntervalRef.current = setInterval(() => {
      sendAnalytics(false)
    }, 30000)

    // Send final analytics on page unload
    const handleBeforeUnload = () => {
      sendAnalytics(true)
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    // Send initial analytics after 5 seconds
    const initialTimeout = setTimeout(() => {
      sendAnalytics(false)
    }, 5000)

    return () => {
      if (sendIntervalRef.current) {
        clearInterval(sendIntervalRef.current)
      }
      clearTimeout(initialTimeout)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      // Send final analytics on cleanup
      sendAnalytics(true)
    }
  }, [projectId, shareToken, sessionId])

  return {
    sessionId,
    totalTimeSeconds: Math.floor((Date.now() - sessionStartTime.current) / 1000)
  }
}

