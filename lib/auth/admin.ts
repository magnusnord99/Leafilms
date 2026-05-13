import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

type AdminAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }

export async function requireAdmin(): Promise<AdminAuthResult> {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile || profile.role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return { ok: true, userId: user.id }
}
