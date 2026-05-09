import { createClient } from '@/lib/supabase-server'

type AdminGuardResult = {
  error: Response | null
}

export async function requireAdmin(): Promise<AdminGuardResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { error: null }
}
