import { createClient } from '@/lib/supabase-server'
import type { User } from '@supabase/supabase-js'

type AdminAuthResult =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; user: User }
  | { ok: false; response: Response }

export async function requireAdmin(): Promise<AdminAuthResult> {
  const supabase = await createClient()
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
      response: Response.json({ error: 'Ikke autorisert' }, { status: 403 }),
    }
  }

  return { ok: true, supabase, user }
}
