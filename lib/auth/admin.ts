import { createClient } from '@/lib/supabase-server'

type AdminAuthResult =
  | { ok: true }
  | { ok: false; response: Response }

export async function requireAdmin(): Promise<AdminAuthResult> {
  const supabase = await createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return {
      ok: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return {
      ok: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return { ok: true }
}
