'use server'

import { createClient } from '@/lib/supabase-server'
import { AVATAR_COLORS, type AvatarColor } from '@/lib/avatar-colors'

export async function updateProfileName(name: string): Promise<{ error?: string }> {
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Navn kan ikke være tomt.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Ikke innlogget.' }

  const { error } = await supabase
    .from('profiles')
    .update({ name: trimmed })
    .eq('id', user.id)

  if (error) {
    console.error('updateProfileName error:', error)
    return { error: 'Kunne ikke lagre navn.' }
  }
  return {}
}

export async function updateProfileColor(color: string): Promise<{ error?: string }> {
  if (!AVATAR_COLORS.includes(color as AvatarColor)) {
    return { error: 'Ugyldig farge.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Ikke innlogget.' }

  const { data: taken } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('color', color)
    .neq('id', user.id)
    .maybeSingle()

  if (taken) {
    return { error: `Fargen er allerede tatt av ${taken.name ?? 'en annen bruker'}.` }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ color })
    .eq('id', user.id)

  if (error) {
    if (error.code === '23505') {
      return { error: 'Fargen ble nettopp tatt av noen andre, velg en annen.' }
    }
    console.error('updateProfileColor error:', error)
    return { error: 'Kunne ikke lagre farge.' }
  }
  return {}
}

export type ProfileColorOwner = { id: string; name: string | null; color: string }

export async function getTakenColors(): Promise<ProfileColorOwner[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, color')
    .not('color', 'is', null)

  if (error) {
    console.error('getTakenColors error:', error)
    return []
  }
  return (data ?? []) as ProfileColorOwner[]
}
