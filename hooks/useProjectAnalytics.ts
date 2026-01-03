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

  // Try to recover sessionId from localStorage on mount
  useEffect(() => {
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
  }, [projectId, shareToken])

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
  }, [sectionIds])

  // Track section visibility using IntersectionObserver + scroll fallback
  useEffect(() => {
    console.log(`[Analytics] Setting up IntersectionObserver for ${sectionIds.length} sections:`, sectionIds.map(id => id.substring(0, 8) + '...'))
    console.log(`[Analytics] Initial state: isActive=${isActive.current}, document.hidden=${document.hidden}, visibilityState=${document.visibilityState}`)
    
    // Ensure isActive is set correctly based on document visibility
    if (document.hidden) {
      isActive.current = false
      console.log('[Analytics] Page is hidden on load, setting isActive=false')
    } else {
      isActive.current = true
      console.log('[Analytics] Page is visible on load, setting isActive=true')
    }
    
    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          const now = Date.now()
          
          entries.forEach(entry => {
            const sectionId = entry.target.getAttribute('data-section-id')
            if (!sectionId) {
              console.warn('[Analytics] Entry without data-section-id attribute')
              return
            }
            
            const timer = sectionTimers.current.get(sectionId)
            if (!timer) {
              console.warn(`[Analytics] No timer found for section ${sectionId}`)
              return
            }
            
            const intersectionRatio = entry.intersectionRatio
            const isVisible = entry.isIntersecting && intersectionRatio > 0.1 // At least 10% visible
            
            console.log(`[Analytics] IntersectionObserver callback: section=${sectionId.substring(0, 8)}..., isIntersecting=${entry.isIntersecting}, ratio=${intersectionRatio.toFixed(2)}, isActive=${isActive.current}, startTime=${timer.startTime}`)
            
            // Start timer if visible (we'll check document.hidden when accumulating time)
            if (isVisible) {
              // Section became visible - start timer
              if (timer.startTime === 0) {
                timer.startTime = now
                console.log(`[Analytics] Section ${sectionId.substring(0, 8)}... became visible (${(intersectionRatio * 100).toFixed(0)}%), starting timer (document.hidden=${document.hidden})`)
              } else {
                // Timer already running, just log
                console.log(`[Analytics] Section ${sectionId.substring(0, 8)}... is visible, timer already running (started ${((now - timer.startTime) / 1000).toFixed(1)}s ago, document.hidden=${document.hidden})`)
              }
            } else {
              // Section became hidden or less than 10% visible - stop timer and accumulate
              if (timer.startTime > 0) {
                const timeSpent = (now - timer.startTime) / 1000
                // Only accumulate if page was active during this period
                if (!document.hidden || isActive.current) {
                  timer.accumulatedTime += timeSpent // Convert to seconds
                  console.log(`[Analytics] Section ${sectionId.substring(0, 8)}... became hidden (${(intersectionRatio * 100).toFixed(0)}%), spent ${timeSpent.toFixed(1)}s, total: ${timer.accumulatedTime.toFixed(1)}s`)
                } else {
                  console.log(`[Analytics] Section ${sectionId.substring(0, 8)}... became hidden, but page was inactive, not accumulating time`)
                }
                timer.startTime = 0
              }
            }
          })
        },
        {
          threshold: [0, 0.1, 0.25, 0.5, 0.75, 1.0], // Multiple thresholds for better tracking
          rootMargin: '0px' // No margin - use default viewport
        }
      )
    }
    
    // Fallback: Use scroll events to track visible sections (ONLY if IntersectionObserver hasn't started timer)
    // This is a true fallback - it only starts timers if IntersectionObserver hasn't done it
    const checkVisibleSections = () => {
      const now = Date.now()
      const viewportHeight = window.innerHeight
      let fallbackStartedCount = 0
      
      sectionIds.forEach(sectionId => {
        const element = document.querySelector(`[data-section-id="${sectionId}"]`)
        if (!element) return
        
        const rect = element.getBoundingClientRect()
        const visibleTop = Math.max(rect.top, 0)
        const visibleBottom = Math.min(rect.bottom, viewportHeight)
        const visibleHeight = Math.max(0, visibleBottom - visibleTop)
        const intersectionRatio = rect.height > 0 ? visibleHeight / rect.height : 0
        const isVisible = rect.top < viewportHeight && rect.bottom > 0 && intersectionRatio > 0.1
        
        const timer = sectionTimers.current.get(sectionId)
        if (!timer) return
        
        // Only use fallback if element is visible AND timer hasn't been started by IntersectionObserver
        // We check if timer.startTime is 0, meaning IntersectionObserver hasn't started it yet
        if (isVisible && timer.startTime === 0 && !document.hidden) {
          timer.startTime = now
          fallbackStartedCount++
          console.log(`[Analytics] Fallback: Starting timer for section ${sectionId.substring(0, 8)}... (IntersectionObserver hasn't triggered yet)`)
        }
        // Don't stop timers in fallback - let IntersectionObserver handle that
      })
      
      if (fallbackStartedCount > 0) {
        console.log(`[Analytics] Fallback: Started ${fallbackStartedCount} timers (IntersectionObserver hasn't triggered yet)`)
      }
    }
    
    // Check on scroll (throttled) - but only as fallback
    let scrollTimeout: NodeJS.Timeout | null = null
    const handleScroll = () => {
      if (scrollTimeout) return
      scrollTimeout = setTimeout(() => {
        checkVisibleSections()
        scrollTimeout = null
      }, 500) // Less frequent - only as fallback
    }
    
    window.addEventListener('scroll', handleScroll, { passive: true })
    
    // Check periodically but less frequently (every 3 seconds) - only as fallback
    const scrollCheckInterval = setInterval(checkVisibleSections, 3000) // Reduced frequency
    
    // Debug check after delay to verify IntersectionObserver is working
    setTimeout(() => {
      console.log('[Analytics] Debug check: Verifying IntersectionObserver is working...')
      let timersStarted = 0
      let timersWithTime = 0
      
      sectionIds.forEach(sectionId => {
        const element = document.querySelector(`[data-section-id="${sectionId}"]`)
        const timer = sectionTimers.current.get(sectionId)
        
        if (element && timer) {
          const rect = element.getBoundingClientRect()
          const isVisible = rect.top < window.innerHeight && rect.bottom > 0
          
          if (timer.startTime > 0) timersStarted++
          if (timer.accumulatedTime > 0) timersWithTime++
          
          console.log(`[Analytics] Section ${sectionId.substring(0, 8)}... - visible: ${isVisible}, timer started: ${timer.startTime > 0}, accumulated: ${timer.accumulatedTime.toFixed(1)}s`)
        }
      })
      
      console.log(`[Analytics] Summary: ${timersStarted} timers started, ${timersWithTime} timers have accumulated time`)
      
      // Only use fallback if IntersectionObserver hasn't started any timers
      if (timersStarted === 0) {
        console.warn('[Analytics] IntersectionObserver has not started any timers, using fallback...')
        checkVisibleSections()
      } else {
        console.log('[Analytics] IntersectionObserver is working, fallback not needed')
      }
    }, 3000) // Check after 3 seconds

    // Observe all sections - wait a bit for DOM to be ready
    const observeSections = () => {
      let observedCount = 0
      const notFound: string[] = []
      
      sectionIds.forEach(sectionId => {
        const element = document.querySelector(`[data-section-id="${sectionId}"]`)
        if (element && observerRef.current) {
          // Check if already observing
          const isAlreadyObserving = observerRef.current.takeRecords().some(entry => entry.target === element)
          if (!isAlreadyObserving) {
            observerRef.current.observe(element)
            observedCount++
            
            // Immediately check if element is visible and trigger manually if needed
            const rect = element.getBoundingClientRect()
            const isVisible = rect.top < window.innerHeight && rect.bottom > 0
            const intersectionRatio = isVisible ? Math.min(1, Math.max(0, (Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0)) / rect.height)) : 0
            
            console.log(`[Analytics] Now observing section ${sectionId.substring(0, 8)}... (visible: ${isVisible}, ratio: ${intersectionRatio.toFixed(2)})`)
            
            // If element is already visible, manually trigger the observer logic
            // Start timer if visible (we'll check document.hidden when accumulating time)
            if (isVisible && intersectionRatio > 0.1) {
              const timer = sectionTimers.current.get(sectionId)
              if (timer && timer.startTime === 0) {
                timer.startTime = Date.now()
                console.log(`[Analytics] Manually starting timer for already-visible section ${sectionId.substring(0, 8)}... (document.hidden=${document.hidden})`)
              }
            }
          } else {
            console.log(`[Analytics] Already observing section ${sectionId.substring(0, 8)}...`)
            observedCount++
          }
        } else {
          notFound.push(sectionId)
          console.warn(`[Analytics] Could not find element with data-section-id="${sectionId}"`)
        }
      })
      
      console.log(`[Analytics] Observing ${observedCount} of ${sectionIds.length} sections`)
      if (notFound.length > 0) {
        console.warn(`[Analytics] Could not find ${notFound.length} elements:`, notFound.map(id => id.substring(0, 8) + '...'))
        // Log all elements with data-section-id for debugging
        const allElements = document.querySelectorAll('[data-section-id]')
        console.log(`[Analytics] Found ${allElements.length} elements with data-section-id in DOM:`, 
          Array.from(allElements).map(el => ({ id: el.getAttribute('data-section-id'), tag: el.tagName }))
        )
      }
    }
    
    // Try multiple times to catch DOM updates
    observeSections()
    
    const timeout1 = setTimeout(() => {
      console.log('[Analytics] Retrying to observe sections after 500ms...')
      observeSections()
    }, 500)
    
    const timeout2 = setTimeout(() => {
      console.log('[Analytics] Retrying to observe sections after 1500ms...')
      observeSections()
    }, 1500)

    return () => {
      clearTimeout(timeout1)
      clearTimeout(timeout2)
      if (scrollTimeout) clearTimeout(scrollTimeout)
      clearInterval(scrollCheckInterval)
      window.removeEventListener('scroll', handleScroll)
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
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
        let time = timer.accumulatedTime // Already in seconds
        if (timer.startTime > 0 && isActive.current) {
          // Add current active time (convert to seconds)
          time += (now - timer.startTime) / 1000
        }
        // Round to nearest second, ensure it's not negative
        sectionTimes[sectionId] = Math.max(0, Math.floor(time))
      })
      
      // Debug logging - always log to see what's being sent
      const nonZeroSections = Object.entries(sectionTimes).filter(([_, time]) => time > 0)
      console.log('[Analytics] Sending data:', {
        totalTimeSeconds,
        sectionTimesCount: Object.keys(sectionTimes).length,
        nonZeroSectionsCount: nonZeroSections.length,
        sectionTimes: nonZeroSections.length > 0 ? nonZeroSections : 'All sections have 0 time',
        allSectionTimes: sectionTimes, // Log all section times to see what's being sent
        isFinal,
        visibilityChanges: visibilityChanges.current,
        sessionId
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
            // Clear localStorage backup after successful save
            try {
              localStorage.removeItem(storageKey)
            } catch (e) {
              // Ignore localStorage errors
            }
          }
          console.log('[Analytics] Data saved successfully', { sessionId: data.sessionId })
        } else {
          const errorText = await response.text().catch(() => 'Unknown error')
          console.warn('[Analytics] Failed to save:', response.status, errorText)
        }
      } catch (error) {
        // Log error but don't break the user experience
        console.error('[Analytics] Tracking error:', error)
      }
    }

    // Send analytics every 10 seconds (more frequent to avoid data loss)
    sendIntervalRef.current = setInterval(() => {
      sendAnalytics(false)
    }, 10000) // Reduced from 30000 to 10000

    // Log that tracking is initialized
    console.log('[Analytics] Tracking initialized for project:', projectId, 'sections:', sectionIds.length)

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
      
      console.log('[Analytics] Page unloading, sending final data:', {
        sectionTimesCount: Object.keys(sectionTimes).length,
        nonZeroSections: Object.entries(sectionTimes).filter(([_, t]) => t > 0).length
      })
      
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

    // Send initial analytics after 3 seconds (reduced from 5)
    const initialTimeout = setTimeout(() => {
      sendAnalytics(false)
    }, 3000)

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
  }, [projectId, shareToken, sessionId])

  return {
    sessionId,
    totalTimeSeconds: Math.floor((Date.now() - sessionStartTime.current) / 1000)
  }
}

