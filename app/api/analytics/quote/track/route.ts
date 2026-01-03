import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      quoteId,
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

    console.log('[Quote Analytics API] Received request:', {
      quoteId,
      projectId,
      shareToken: shareToken?.substring(0, 10) + '...',
      sessionId,
      totalTimeSeconds,
      isFinal
    })

    if (!quoteId || !projectId || !shareToken) {
      console.error('[Quote Analytics API] Missing required fields:', {
        hasQuoteId: !!quoteId,
        hasProjectId: !!projectId,
        hasShareToken: !!shareToken
      })
      return NextResponse.json(
        { error: 'Missing required fields: quoteId, projectId, shareToken' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Verify that the share token exists and belongs to the project
    const { data: share, error: shareError } = await supabase
      .from('project_shares')
      .select('project_id, token')
      .eq('token', shareToken)
      .eq('project_id', projectId)
      .single()

    if (shareError || !share) {
      console.error('[Quote Analytics API] Invalid share token:', shareError)
      return NextResponse.json(
        { error: 'Invalid share token' },
        { status: 403 }
      )
    }

    // Verify that the quote exists and belongs to the project
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('id, project_id')
      .eq('id', quoteId)
      .eq('project_id', projectId)
      .single()

    if (quoteError || !quote) {
      console.error('[Quote Analytics API] Invalid quote:', quoteError)
      return NextResponse.json(
        { error: 'Invalid quote ID or quote does not belong to project' },
        { status: 403 }
      )
    }

    if (sessionId) {
      // Update existing session
      const updateData: any = {
        section_times: sectionTimes,
        total_time_seconds: totalTimeSeconds,
        visibility_changes: visibilityChanges,
        is_active: isActive,
        updated_at: new Date().toISOString()
      }

      if (isFinal) {
        updateData.session_ended_at = new Date().toISOString()
      }

      const { data, error } = await supabase
        .from('quote_analytics')
        .update(updateData)
        .eq('id', sessionId)
        .select()
        .single()

      if (error) {
        console.error('[Quote Analytics API] Error updating quote analytics:', error)
        return NextResponse.json(
          { error: 'Failed to update quote analytics' },
          { status: 500 }
        )
      }

      console.log('[Quote Analytics API] Updated session:', data.id)
      return NextResponse.json({ success: true, sessionId: data.id })
    } else {
      // Create new session
      const { data, error } = await supabase
        .from('quote_analytics')
        .insert({
          quote_id: quoteId,
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
        console.error('[Quote Analytics API] Error creating quote analytics:', error)
        return NextResponse.json(
          { error: 'Failed to create quote analytics' },
          { status: 500 }
        )
      }

      console.log('[Quote Analytics API] Created new session:', data.id)
      return NextResponse.json({ success: true, sessionId: data.id })
    }
  } catch (error: any) {
    console.error('Quote analytics tracking error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

