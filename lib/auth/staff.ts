import type { SupabaseClient, User } from '@supabase/supabase-js'
import { isStaffRole } from '@/lib/permissions'

export async function getAuthenticatedStaffUser(
  supabase: SupabaseClient
): Promise<User | null> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return null

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return !profileError && isStaffRole(profile?.role) ? user : null
}

export async function isStaffProfile(
  supabase: SupabaseClient,
  profileId: string
): Promise<boolean> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', profileId)
    .single()

  return !error && isStaffRole(profile?.role)
}
