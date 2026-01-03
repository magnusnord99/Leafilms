'use client'

import { useEffect, useRef, useState } from 'react'

interface QuoteSectionTime {
  sectionName: string
  startTime: number
  accumulatedTime: number
}

interface QuoteAnalyticsData {
  quoteId: string
  projectId: string
  shareToken: string
  sessionStartedAt: string
  sectionTimes: Record<string, number> // { "header": seconds, "line_items": seconds, "totals": seconds, "actions": seconds }
  totalTimeSeconds: number
  visibilityChanges: number
  isActive: boolean
}

/**
 * Hook for tracking analytics on quote sections in public project views
 * Tracks:
 * - Total time viewing quote section
 * - Time spent per quote part (header, line_items, totals, actions)
 * - Page visibility changes
 */
export function useQuoteAnalytics(
  quoteId: string,
  projectId: string,
  shareToken: string,
  sectionNames: string[] // ['header', 'line_items', 'totals', 'actions']
) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  
  // Don't track if we don't have required data
  const shouldTrack = quoteId && projectId && shareToken && sectionNames.length > 0
  const sessionStartTime = useRef<number>(Date.now())
  const sectionTimers = useRef<Map<string, QuoteSectionTime>>(new Map())
  const visibilityChanges = useRef<number>(0)
  const isActive = useRef<boolean>(true)
  const lastActiveTime = useRef<number>(Date.now())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const sendIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize section timers
  useEffect(() => {
    if (!shouldTrack) return
    
    sectionNames.forEach(sectionName => {
      sectionTimers.current.set(sectionName, {
        sectionName,
        startTime: 0,
        accumulatedTime: 0
      })
    })
  }, [sectionNames, shouldTrack])

  // Track page visibility (when user switches tabs, minimizes window, etc.)
  useEffect(() => {
    if (!shouldTrack) return
    
    const handleVisibilityChange = () => {
      const now = Date.now()
      
      if (document.hidden) {
        // Page became hidden - pause all active timers
        isActive.current = false
        visibilityChanges.current++
        
        // Pause all active section timers
        sectionTimers.current.forEach((timer) => {
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
        sectionNames.forEach(sectionName => {
          const element = document.querySelector(`[data-quote-section="${sectionName}"]`)
          if (element) {
            const rect = element.getBoundingClientRect()
            const isVisible = rect.top < window.innerHeight && rect.bottom > 0
            
            if (isVisible) {
              const timer = sectionTimers.current.get(sectionName)
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
  }, [sectionNames, shouldTrack])

  // Track quote section part visibility using IntersectionObserver
  useEffect(() => {
    if (!shouldTrack) return
    
    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          const now = Date.now()
          
          entries.forEach(entry => {
            const sectionName = entry.target.getAttribute('data-quote-section')
            if (!sectionName) return
            
            const timer = sectionTimers.current.get(sectionName)
            if (!timer) return
            
            if (entry.isIntersecting && isActive.current) {
              // Section part became visible - start timer
              if (timer.startTime === 0) {
                timer.startTime = now
              }
            } else {
              // Section part became hidden - stop timer and accumulate
              if (timer.startTime > 0) {
                timer.accumulatedTime += (now - timer.startTime) / 1000 // Convert to seconds
                timer.startTime = 0
              }
            }
          })
        },
        {
          threshold: 0.3, // Section part is considered visible when 30% is in viewport
          rootMargin: '0px'
        }
      )
    }

    // Observe all quote section parts
    sectionNames.forEach(sectionName => {
      const element = document.querySelector(`[data-quote-section="${sectionName}"]`)
      if (element && observerRef.current) {
        observerRef.current.observe(element)
      }
    })

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [sectionNames, shouldTrack])

  // Reset session when quoteId changes from empty to set (or vice versa)
  useEffect(() => {
    if (shouldTrack && !sessionId) {
      // Reset session start time when tracking starts
      sessionStartTime.current = Date.now()
      console.log('[useQuoteAnalytics] Starting tracking:', { quoteId, projectId, shareToken })
    }
  }, [quoteId, projectId, shareToken, shouldTrack, sessionId])

  // Send analytics data periodically (every 30 seconds) and on page unload
  useEffect(() => {
    if (!shouldTrack) {
      // Clean up if we shouldn't track
      if (sendIntervalRef.current) {
        clearInterval(sendIntervalRef.current)
        sendIntervalRef.current = null
      }
      return
    }
    
    const sendAnalytics = async (isFinal = false) => {
      const now = Date.now()
      const totalTimeSeconds = Math.floor((now - sessionStartTime.current) / 1000)
      
      // Calculate final times for all quote section parts
      const sectionTimes: Record<string, number> = {}
      sectionTimers.current.forEach((timer) => {
        let time = timer.accumulatedTime
        if (timer.startTime > 0 && isActive.current) {
          // Add current active time
          time += (now - timer.startTime) / 1000
        }
        sectionTimes[timer.sectionName] = Math.floor(time)
      })

      const analyticsData: QuoteAnalyticsData = {
        quoteId,
        projectId,
        shareToken,
        sessionStartedAt: new Date(sessionStartTime.current).toISOString(),
        sectionTimes,
        totalTimeSeconds,
        visibilityChanges: visibilityChanges.current,
        isActive: isActive.current
      }

      try {
        const response = await fetch('/api/analytics/quote/track', {
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
          if (data.sessionId && !sessionId) {
            setSessionId(data.sessionId)
            console.log('[useQuoteAnalytics] Session created:', data.sessionId)
          }
        } else {
          const errorData = await response.json().catch(() => ({}))
          console.error('[useQuoteAnalytics] Tracking failed:', response.status, errorData)
        }
      } catch (error) {
        // Silently fail - analytics should not break the user experience
        console.error('Quote analytics tracking error:', error)
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
        sendIntervalRef.current = null
      }
      clearTimeout(initialTimeout)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      // Send final analytics on cleanup
      if (shouldTrack) {
        sendAnalytics(true)
      }
    }
  }, [quoteId, projectId, shareToken, sessionId, shouldTrack])

  return {
    sessionId,
    totalTimeSeconds: Math.floor((Date.now() - sessionStartTime.current) / 1000)
  }
}

