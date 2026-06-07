import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type AdminAuthSuccess = {
  ok: true
  user: User
}

type AdminAuthFailure = {
  ok: false
  response: Response
}

type AdminAuthResult = AdminAuthSuccess | AdminAuthFailure

type AdminCheckClient = Pick<SupabaseServerClient, 'auth' | 'from'>

export async function requireAdminForClient(
  supabase: AdminCheckClient
): Promise<AdminAuthResult> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      ok: false,
      response: Response.json({ error: 'Ikke autentisert' }, { status: 401 }),
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError || profile?.role !== 'admin') {
    return {
      ok: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return { ok: true, user }
}

export async function requireAdmin(): Promise<
  (AdminAuthSuccess & { supabase: SupabaseServerClient }) | AdminAuthFailure
> {
  const supabase = await createClient()
  const auth = await requireAdminForClient(supabase)

  if (!auth.ok) {
    return auth
  }

  return { ...auth, supabase }
}
