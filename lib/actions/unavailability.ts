'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'

export type UnavailabilityBlock = {
  id: string
  profileId: string
  profileName: string
  date: string              // 'YYYY-MM-DD' — første dag
  endDate: string | null    // 'YYYY-MM-DD' — siste dag ved fler-dagers rekkevidde, ellers null
  startTime: string | null  // 'HH:MM:SS'
  endTime: string | null
  note: string | null
}

type UnavailabilityRow = {
  id: string
  profile_id: string
  date: string
  end_date: string | null
  start_time: string | null
  end_time: string | null
  note: string | null
  profiles: { name: string | null; email: string } | { name: string | null; email: string }[] | null
}

function firstOf<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

/**
 * Alltid alle blokker uansett person-filter — synlighet er "alle ansatte, alltid",
 * jf. avklaring med Magnus (poenget er at kolleger skal se det før de booker deg).
 */
export async function getUnavailability(): Promise<UnavailabilityBlock[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('unavailability')
      .select('id, profile_id, date, end_date, start_time, end_time, note, profiles ( name, email )')
    if (error) { console.error('getUnavailability:', error); return [] }

    return ((data ?? []) as unknown as UnavailabilityRow[]).map((r) => {
      const profile = firstOf(r.profiles)
      return {
        id: r.id,
        profileId: r.profile_id,
        profileName: profile?.name ?? profile?.email ?? 'Ukjent',
        date: r.date,
        endDate: r.end_date,
        startTime: r.start_time,
        endTime: r.end_time,
        note: r.note,
      }
    })
  } catch (err) {
    console.error('getUnavailability error:', err)
    return []
  }
}

export async function createUnavailability(input: {
  date: string
  endDate: string | null
  startTime: string | null
  endTime: string | null
  note: string | null
}): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!input.date) return { ok: false, error: 'Velg en dato' }
    if (input.endDate && input.endDate < input.date) return { ok: false, error: '"Til og med"-dato kan ikke være før startdato' }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Ikke autentisert' }

    // Fler-dagers rekkevidde er alltid hele dager — klokkeslett gir ikke mening der.
    const isRange = !!input.endDate && input.endDate !== input.date

    const { error } = await supabase.from('unavailability').insert({
      profile_id: user.id,
      date: input.date,
      end_date: input.endDate || null,
      start_time: isRange ? null : (input.startTime || null),
      end_time: isRange ? null : (input.endTime || null),
      note: input.note?.trim() || null,
    })
    if (error) { console.error('createUnavailability:', error); return { ok: false, error: 'Kunne ikke lagre' } }

    revalidatePath('/admin/calendar')
    return { ok: true }
  } catch (err) {
    console.error('createUnavailability error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function deleteUnavailability(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('unavailability').delete().eq('id', id)
    if (error) { console.error('deleteUnavailability:', error); return { ok: false, error: 'Kunne ikke slette' } }
    revalidatePath('/admin/calendar')
    return { ok: true }
  } catch (err) {
    console.error('deleteUnavailability error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}
