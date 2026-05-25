import type { SupabaseClient, User } from '@supabase/supabase-js'

type AdminAuthResult =
  | { user: User; errorResponse: null }
  | { user: null; errorResponse: Response }

export async function requireAdmin(supabase: SupabaseClient): Promise<AdminAuthResult> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return {
      user: null,
      errorResponse: Response.json({ error: 'Ikke autentisert' }, { status: 401 }),
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError || profile?.role !== 'admin') {
    return {
      user: null,
      errorResponse: Response.json({ error: 'Ikke autorisert' }, { status: 403 }),
    }
  }

  return { user, errorResponse: null }
}
