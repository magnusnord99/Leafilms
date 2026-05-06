import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    // Handle both JSON and Blob (from sendBeacon)
    let body
    const contentType = request.headers.get('content-type')
    
    try {
      if (contentType?.includes('application/json')) {
        body = await request.json()
      } else {
        // Handle sendBeacon blob or text/plain
        const text = await request.text()
        body = JSON.parse(text)
      }
    } catch (parseError) {
      console.error('[Analytics API] Error parsing request body:', parseError)
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }
    
    const {
      projectId,
      shareToken,
      sessionId,
      sessionStartedAt,
      sectionTimes,
      totalTimeSeconds,
      visibilityChanges,
      isActive,
      isFinal
    } = body

    if (!projectId || !shareToken) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Reject analytics from authenticated admin users (server-side guard)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      if (profile?.role === 'admin') {
        return NextResponse.json({ success: true, skipped: true })
      }
    }

    // Verify that the share token exists and belongs to the project
    const { data: share, error: shareError } = await supabase
      .from('project_shares')
      .select('project_id, token')
      .eq('token', shareToken)
      .eq('project_id', projectId)
      .single()

    if (shareError || !share) {
      return NextResponse.json(
        { error: 'Invalid share token' },
        { status: 403 }
      )
    }

    if (sessionId) {
      // First, fetch existing session to merge section_times
      const { data: existingSession, error: fetchError } = await supabase
        .from('project_analytics')
        .select('section_times')
        .eq('id', sessionId)
        .single()

      if (fetchError) {
        console.error('[Analytics API] Error fetching existing session:', fetchError)
        return NextResponse.json(
          { error: 'Failed to fetch existing session' },
          { status: 500 }
        )
      }

      // Merge existing section_times with new ones
      // Client sends accumulated time for all sections, so we should take the maximum
      // to ensure we don't lose time when user scrolls between sections
      const existingSectionTimes = existingSession?.section_times || {}
      const newSectionTimes = sectionTimes || {}
      const mergedSectionTimes: Record<string, number> = {}
      
      // Collect all unique section IDs from both existing and new data
      const allSectionIds = new Set([
        ...Object.keys(existingSectionTimes),
        ...Object.keys(newSectionTimes)
      ])
      
      // For each section, take the maximum of existing and new
      // This ensures we don't lose accumulated time when user scrolls between sections
      allSectionIds.forEach(sectionId => {
        const existingTime = existingSectionTimes[sectionId] || 0
        const newTime = newSectionTimes[sectionId] || 0
        // Take the maximum to ensure we don't lose accumulated time
        // (client already accumulates, so max is the most recent total)
        mergedSectionTimes[sectionId] = Math.max(existingTime, newTime)
      })

      // Update existing session with merged data
      const updateData: any = {
        section_times: mergedSectionTimes,
        total_time_seconds: totalTimeSeconds,
        visibility_changes: visibilityChanges,
        is_active: isActive,
        updated_at: new Date().toISOString()
      }

      if (isFinal) {
        updateData.session_ended_at = new Date().toISOString()
      }

      const { data, error } = await supabase
        .from('project_analytics')
        .update(updateData)
        .eq('id', sessionId)
        .select()
        .single()

      if (error) {
        console.error('[Analytics API] Error updating analytics:', error)
        return NextResponse.json(
          { error: 'Failed to update analytics' },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true, sessionId: data.id })
    } else {
      // Create new session
      const { data, error } = await supabase
        .from('project_analytics')
        .insert({
          project_id: projectId,
          share_token: shareToken,
          session_started_at: sessionStartedAt,
          session_ended_at: isFinal ? new Date().toISOString() : null,
          total_time_seconds: totalTimeSeconds,
          section_times: sectionTimes,
          visibility_changes: visibilityChanges,
          is_active: isActive,
          user_agent: request.headers.get('user-agent') || null,
          referrer: request.headers.get('referer') || null
        })
        .select()
        .single()

      if (error) {
        console.error('[Analytics API] Error creating analytics:', error)
        return NextResponse.json(
          { error: 'Failed to create analytics' },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true, sessionId: data.id })
    }
  } catch (error: any) {
    console.error('Analytics tracking error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

