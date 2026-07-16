import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Create Supabase client for middleware
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Check if route is protected (admin routes)
  const isAdminRoute = request.nextUrl.pathname.startsWith('/admin')
  const isLoginRoute = request.nextUrl.pathname.startsWith('/login')
  const isAuthRoute = request.nextUrl.pathname.startsWith('/auth/')
  const isPublicRoute = request.nextUrl.pathname.startsWith('/p/') || request.nextUrl.pathname === '/'

  // If it's a public route or auth route, allow access
  if (isPublicRoute || isAuthRoute) {
    return response
  }

  // If it's the login route, check if user is already logged in
  if (isLoginRoute) {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      // User is logged in, redirect to admin
      return NextResponse.redirect(new URL('/admin', request.url))
    }

    return response
  }

  // Protect admin routes
  if (isAdminRoute) {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      // No user, redirect to login
      const redirectUrl = new URL('/login', request.url)
      redirectUrl.searchParams.set('redirect', request.nextUrl.pathname)
      return NextResponse.redirect(redirectUrl)
    }

    // Sjekk at brukeren er en intern staff-rolle (admin/salg/produksjon) — 'customer'-brukere
    // skal aldri inn i /admin, men alle staff-roller slipper forbi her. Finmasket
    // sidetilgang (meny, pipeline-steg, økonomi-sider) håndteres i app/admin/layout.tsx og
    // den enkelte siden, ikke her.
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'sales', 'production'].includes(profile.role)) {
      // Ikke en gyldig staff-rolle, redirect til login
      const redirectUrl = new URL('/login', request.url)
      redirectUrl.searchParams.set('error', 'unauthorized')
      return NextResponse.redirect(redirectUrl)
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

