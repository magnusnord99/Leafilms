import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const token = requestUrl.searchParams.get('token')
  const type = requestUrl.searchParams.get('type')
  const redirect = requestUrl.searchParams.get('redirect') || '/admin'

  // Log for debugging (always log in production for troubleshooting)
  console.log('Auth callback - URL:', requestUrl.toString())
  console.log('Auth callback - Params:', { code: code ? 'present' : 'missing', token: token ? 'present' : 'missing', type, redirect })

  const supabase = await createClient()

  // Håndter invitasjoner - hvis redirect er til accept-invitation, håndter det
  if (redirect === '/auth/accept-invitation' || redirect.includes('accept-invitation')) {
    // Exchange code for session først
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        console.error('Error exchanging code for session:', error)
        // Redirect til accept-invitation med feilmelding
        const acceptUrl = new URL('/auth/accept-invitation', request.url)
        acceptUrl.searchParams.set('error', 'code_exchange_failed')
        return NextResponse.redirect(acceptUrl)
      }
      
      // Sjekk om dette er en invitasjon (brukeren har ikke passord satt ennå)
      if (data.user) {
        // Redirect til accept-invitation siden - session er nå satt
        const acceptUrl = new URL('/auth/accept-invitation', request.url)
        return NextResponse.redirect(acceptUrl)
      }
    }
  }

  // Håndter invitasjoner med type='invite' eller token parameter
  if (type === 'invite' || token) {
    // Hvis vi har en code, exchange den først
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        console.error('Error exchanging code for session:', error)
        const acceptUrl = new URL('/auth/accept-invitation', request.url)
        acceptUrl.searchParams.set('error', 'code_exchange_failed')
        return NextResponse.redirect(acceptUrl)
      }
    }
    
    // Redirect til accept-invitation siden
    const acceptUrl = new URL('/auth/accept-invitation', request.url)
    if (token) {
      acceptUrl.searchParams.set('token', token)
    }
    if (code) {
      acceptUrl.searchParams.set('code', code)
    }
    if (type) {
      acceptUrl.searchParams.set('type', type)
    }
    return NextResponse.redirect(acceptUrl)
  }

  // Håndter OAuth callbacks (Google login, etc.)
  if (code) {
    await supabase.auth.exchangeCodeForSession(code)
  }

  // Check if user is admin
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      // Not admin, sign out and redirect to login with error
      await supabase.auth.signOut()
      return NextResponse.redirect(
        new URL(`/login?error=unauthorized`, request.url)
      )
    }
  }

  return NextResponse.redirect(new URL(redirect, request.url))
}

