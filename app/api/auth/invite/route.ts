import { createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { isStaffRole } from '@/lib/permissions'

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
    const { email, name, role } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Trigger'en public.handle_new_user() setter role='customer' på nye profiler
    // (fail-closed, se migrasjon 143). Vi overskriver den under med den valgte
    // staff-rollen. Ugyldig/manglende rolle faller tilbake til 'sales' i stedet
    // for å gi en ny bruker full admin-tilgang.
    const resolvedRole = isStaffRole(role) ? role : 'sales'

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

    // Oppdater profilen med navn (hvis oppgitt) og den valgte staff-rollen —
    // trigger'en setter 'customer' som standard, så rollen må overskrives her.
    if (inviteData.user) {
      await adminClient
        .from('profiles')
        .update({ ...(name ? { name } : {}), role: resolvedRole })
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
  } catch (error) {
    console.error('Error in invite route:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

