import { createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check if user is authenticated and is admin
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get request body
    const { email, name } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Invite user via Supabase Auth
    // Note: This requires the service role key, but we can use the admin API
    // For now, we'll use the admin client which requires SUPABASE_SERVICE_ROLE_KEY
    // For production, you might want to use Supabase Management API or a server action

    // Alternative: Use Supabase Admin API
    // This requires SUPABASE_SERVICE_ROLE_KEY environment variable
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'Service role key not configured' },
        { status: 500 }
      )
    }

    // Create admin client with service role
    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Get the redirect URL for the invitation
    // Supabase will redirect here with a code parameter (PKCE flow) or token
    // We'll handle the code/token exchange directly in accept-invitation page
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL 
      ? process.env.NEXT_PUBLIC_SITE_URL
      : request.headers.get('origin') || request.headers.get('host') 
        ? `https://${request.headers.get('host')}`
        : 'http://localhost:3000'
    
    const redirectTo = `${baseUrl}/auth/accept-invitation`
    
    // Log for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('Invite - redirectTo:', redirectTo)
      console.log('Invite - NEXT_PUBLIC_SITE_URL:', process.env.NEXT_PUBLIC_SITE_URL)
      console.log('Invite - origin:', request.headers.get('origin'))
      console.log('Invite - host:', request.headers.get('host'))
    }

    // Invite user
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          name: name || null,
        },
        redirectTo: redirectTo,
      }
    )

    if (inviteError) {
      console.error('Error inviting user:', inviteError)
      return NextResponse.json(
        { error: inviteError.message || 'Failed to invite user' },
        { status: 400 }
      )
    }

    // Update profile with name if provided
    if (inviteData.user && name) {
      await adminClient
        .from('profiles')
        .update({ name })
        .eq('id', inviteData.user.id)
    }

    return NextResponse.json({
      success: true,
      message: 'Invitasjon sendt',
      user: {
        id: inviteData.user?.id,
        email: inviteData.user?.email,
      },
    })
  } catch (error: any) {
    console.error('Error in invite route:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

