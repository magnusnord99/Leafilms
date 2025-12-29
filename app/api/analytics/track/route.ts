import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
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
        .from('project_analytics')
        .update(updateData)
        .eq('id', sessionId)
        .select()
        .single()

      if (error) {
        console.error('Error updating analytics:', error)
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
        console.error('Error creating analytics:', error)
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

