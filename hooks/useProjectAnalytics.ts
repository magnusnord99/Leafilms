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
 * 
 * @param isAdmin - If true, tracking is disabled (admin users should not be tracked)
 */
export function useProjectAnalytics(projectId: string, shareToken: string, sectionIds: string[], isAdmin: boolean = false) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const sessionStartTime = useRef<number>(Date.now())
  const sectionTimers = useRef<Map<string, SectionTime>>(new Map())
  const visibilityChanges = useRef<number>(0)
  const isActive = useRef<boolean>(true)
  const lastActiveTime = useRef<number>(Date.now())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const sendIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Try to recover sessionId from localStorage on mount
  useEffect(() => {
    if (isAdmin) return // Skip tracking for admin users
    const storageKey = `analytics_${projectId}_${shareToken}`
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      try {
        const savedData = JSON.parse(saved)
        // Only restore if it's recent (within last hour)
        if (savedData.timestamp && (Date.now() - savedData.timestamp) < 3600000) {
          if (savedData.sessionId) {
            setSessionId(savedData.sessionId)
          }
          // Try to send the saved data
          if (savedData.sectionTimes) {
            fetch('/api/analytics/track', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...savedData,
                isFinal: false // Don't mark as final when recovering
              })
            }).then(() => {
              localStorage.removeItem(storageKey)
            }).catch(() => {
              // Keep in localStorage if send fails
            })
          }
        } else {
          // Old data, remove it
          localStorage.removeItem(storageKey)
        }
      } catch (e) {
        // Invalid data, remove it
        localStorage.removeItem(storageKey)
      }
    }
  }, [projectId, shareToken, isAdmin])

  // Initialize section timers
  useEffect(() => {
    if (isAdmin) return // Skip tracking for admin users
    sectionIds.forEach(sectionId => {
      // Don't overwrite existing timers — they may already have accumulated time
      if (!sectionTimers.current.has(sectionId)) {
        sectionTimers.current.set(sectionId, {
          sectionId,
          startTime: 0,
          accumulatedTime: 0
        })
      }
    })
  }, [sectionIds, isAdmin])

  // Track page visibility (when user switches tabs, minimizes window, etc.)
  useEffect(() => {
    if (isAdmin) return // Skip tracking for admin users
    const handleVisibilityChange = () => {
      const now = Date.now()
      
      if (document.hidden) {
        // Page became hidden - pause all active timers
        isActive.current = false
        visibilityChanges.current++
        
        // Pause all active section timers - CONVERT TO SECONDS!
        sectionTimers.current.forEach((timer, sectionId) => {
          if (timer.startTime > 0) {
            timer.accumulatedTime += (now - timer.startTime) / 1000 // Convert to seconds
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
  }, [sectionIds, isAdmin])

  // Track section visibility using IntersectionObserver + scroll fallback
  useEffect(() => {
    if (isAdmin) return // Skip tracking for admin users

    // Ensure isActive is set correctly based on document visibility
    isActive.current = !document.hidden

    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          const now = Date.now()

          entries.forEach(entry => {
            const sectionId = entry.target.getAttribute('data-section-id')
            if (!sectionId) return

            const timer = sectionTimers.current.get(sectionId)
            if (!timer) return

            const isVisible = entry.isIntersecting && entry.intersectionRatio > 0.1

            if (isVisible) {
              if (timer.startTime === 0) {
                timer.startTime = now
              }
            } else {
              if (timer.startTime > 0) {
                const timeSpent = (now - timer.startTime) / 1000
                if (!document.hidden || isActive.current) {
                  timer.accumulatedTime += timeSpent
                }
                timer.startTime = 0
              }
            }
          })
        },
        {
          threshold: [0, 0.1, 0.25, 0.5, 0.75, 1.0],
          rootMargin: '0px'
        }
      )
    }

    // Fallback scroll check — only starts timers if IntersectionObserver hasn't
    const checkVisibleSections = () => {
      const now = Date.now()
      const viewportHeight = window.innerHeight

      sectionIds.forEach(sectionId => {
        const element = document.querySelector(`[data-section-id="${sectionId}"]`)
        if (!element) return

        const rect = element.getBoundingClientRect()
        const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0))
        const ratio = rect.height > 0 ? visibleHeight / rect.height : 0
        const isVisible = rect.top < viewportHeight && rect.bottom > 0 && ratio > 0.1

        const timer = sectionTimers.current.get(sectionId)
        if (!timer) return

        if (isVisible && timer.startTime === 0 && !document.hidden) {
          timer.startTime = now
        }
      })
    }

    // Throttled scroll fallback
    let scrollTimeout: NodeJS.Timeout | null = null
    const handleScroll = () => {
      if (scrollTimeout) return
      scrollTimeout = setTimeout(() => {
        checkVisibleSections()
        scrollTimeout = null
      }, 500)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })

    // Observe all sections - try multiple times to catch DOM updates
    const observeSections = () => {
      sectionIds.forEach(sectionId => {
        const element = document.querySelector(`[data-section-id="${sectionId}"]`)
        if (element && observerRef.current) {
          observerRef.current.observe(element)

          // Manually start timer if already visible
          const rect = element.getBoundingClientRect()
          const isVisible = rect.top < window.innerHeight && rect.bottom > 0
          const ratio = rect.height > 0
            ? Math.min(1, Math.max(0, (Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0)) / rect.height))
            : 0
          if (isVisible && ratio > 0.1) {
            const timer = sectionTimers.current.get(sectionId)
            if (timer && timer.startTime === 0) {
              timer.startTime = Date.now()
            }
          }
        }
      })
    }

    observeSections()
    const timeout1 = setTimeout(observeSections, 500)
    const timeout2 = setTimeout(observeSections, 1500)

    return () => {
      clearTimeout(timeout1)
      clearTimeout(timeout2)
      if (scrollTimeout) clearTimeout(scrollTimeout)
      window.removeEventListener('scroll', handleScroll)
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }
    }
  }, [sectionIds, isAdmin])

  // Send analytics data periodically (every 30 seconds) and on page unload
  useEffect(() => {
    if (isAdmin) return // Skip tracking for admin users
    const sendAnalytics = async (isFinal = false) => {
      const now = Date.now()
      const totalTimeSeconds = Math.floor((now - sessionStartTime.current) / 1000)
      
      // Calculate final times for all sections
      const sectionTimes: Record<string, number> = {}
      sectionTimers.current.forEach((timer, sectionId) => {
        let time = timer.accumulatedTime // Already in seconds
        if (timer.startTime > 0 && isActive.current) {
          // Add current active time (convert to seconds)
          time += (now - timer.startTime) / 1000
        }
        // Round to nearest second, ensure it's not negative
        sectionTimes[sectionId] = Math.max(0, Math.floor(time))
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
        // Store in localStorage as backup before sending (only if available)
        const storageKey = `analytics_${projectId}_${shareToken}`
        try {
          localStorage.setItem(storageKey, JSON.stringify({
            ...analyticsData,
            sessionId,
            isFinal,
            timestamp: Date.now()
          }))
        } catch (storageError) {
          // localStorage might be disabled or full, continue anyway
          console.warn('[Analytics] Could not save to localStorage:', storageError)
        }

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

        if (response.ok) {
          const data = await response.json()
          if (data.sessionId) {
            setSessionId(data.sessionId)
            try {
              localStorage.removeItem(storageKey)
            } catch (e) {
              // Ignore localStorage errors
            }
          }
        }
      } catch (error) {
        // Log error but don't break the user experience
        console.error('[Analytics] Tracking error:', error)
      }
    }

    // Send analytics every 30 seconds
    sendIntervalRef.current = setInterval(() => {
      sendAnalytics(false)
    }, 30000)

    // Send final analytics on page unload - use flag to prevent duplicate sends
    let finalSent = false
    const handleBeforeUnload = () => {
      if (finalSent) return // Prevent duplicate sends
      finalSent = true
      
      // Use sendBeacon for more reliable delivery on page unload
      const now = Date.now()
      const sectionTimes: Record<string, number> = {}
      sectionTimers.current.forEach((timer, sectionId) => {
        let time = timer.accumulatedTime
        if (timer.startTime > 0 && isActive.current) {
          time += (now - timer.startTime) / 1000
        }
        sectionTimes[sectionId] = Math.max(0, Math.floor(time))
      })
      
      const analyticsData = {
        projectId,
        shareToken,
        sessionStartedAt: new Date(sessionStartTime.current).toISOString(),
        sectionTimes,
        totalTimeSeconds: Math.floor((now - sessionStartTime.current) / 1000),
        visibilityChanges: visibilityChanges.current,
        isActive: isActive.current,
        sessionId,
        isFinal: true
      }
      
      // Try sendBeacon first (more reliable for page unload)
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(analyticsData)], { type: 'application/json' })
        const sent = navigator.sendBeacon('/api/analytics/track', blob)
        if (!sent) {
          console.warn('[Analytics] sendBeacon failed, trying fetch')
          // Fallback to fetch with keepalive
          fetch('/api/analytics/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(analyticsData),
            keepalive: true
          }).catch(() => {}) // Ignore errors on unload
        }
      } else {
        // Fallback to fetch with keepalive
        fetch('/api/analytics/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(analyticsData),
          keepalive: true
        }).catch(() => {}) // Ignore errors on unload
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handleBeforeUnload) // Also listen to pagehide

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
      window.removeEventListener('pagehide', handleBeforeUnload)
      // Don't send final analytics here - beforeunload/pagehide already handles it
      // Sending here can cause duplicate final requests
    }
  }, [projectId, shareToken, sessionId, isAdmin])

  return {
    sessionId,
    totalTimeSeconds: Math.floor((Date.now() - sessionStartTime.current) / 1000)
  }
}

