import type { User } from '@supabase/supabase-js'
import { isStaffRole } from '@/lib/permissions'
import { createClient } from '@/lib/supabase-server'

export type StaffAuthResult =
  | { ok: true; user: User }
  | { ok: false }

/**
 * Fail-closed staff gate for API routes that use the service role or other
 * elevated credentials. Customer JWTs (gallery/quote logins) must not pass.
 */
export async function getAuthenticatedStaffUser(): Promise<StaffAuthResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (!isStaffRole(profile?.role)) return { ok: false }

  return { ok: true, user }
}
