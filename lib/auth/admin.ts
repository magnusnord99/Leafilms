import type { User } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type AdminProfile = {
  role: string
  name: string | null
  email: string | null
}

type AdminAuthResult =
  | {
      ok: true
      supabase: SupabaseServerClient
      user: User
      profile: AdminProfile
    }
  | {
      ok: false
      response: NextResponse
    }

export async function requireAdmin(): Promise<AdminAuthResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, name, email')
    .eq('id', user.id)
    .single()

  if (profileError || !profile || profile.role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return {
    ok: true,
    supabase,
    user,
    profile,
  }
}
