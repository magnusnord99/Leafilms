'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { STAFF_ROLES } from '@/lib/permissions'

export type MeetingParticipant = {
  profileId: string
  name: string
  email: string
  status: 'pending' | 'accepted' | 'declined'
}

export type MeetingEvent = {
  id: string
  title: string
  startsAt: string
  endsAt: string | null
  meetingLink: string | null
  notes: string | null
  organizerId: string
  organizerName: string
  participants: MeetingParticipant[]
}

type MeetingRow = {
  id: string
  title: string
  starts_at: string
  ends_at: string | null
  meeting_link: string | null
  notes: string | null
  organizer_id: string
  organizer: { name: string | null; email: string } | { name: string | null; email: string }[] | null
  meeting_participants: {
    profile_id: string
    status: 'pending' | 'accepted' | 'declined'
    profiles: { name: string | null; email: string } | { name: string | null; email: string }[] | null
  }[]
}

function firstOf<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function mapMeeting(row: MeetingRow): MeetingEvent {
  const organizer = firstOf(row.organizer)
  return {
    id: row.id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    meetingLink: row.meeting_link,
    notes: row.notes,
    organizerId: row.organizer_id,
    organizerName: organizer?.name ?? organizer?.email ?? 'Ukjent',
    participants: (row.meeting_participants ?? []).map((p) => {
      const profile = firstOf(p.profiles)
      return {
        profileId: p.profile_id,
        name: profile?.name ?? profile?.email ?? 'Ukjent',
        email: profile?.email ?? '',
        status: p.status,
      }
    }),
  }
}

const MEETING_SELECT = `
  id, title, starts_at, ends_at, meeting_link, notes, organizer_id,
  organizer:profiles!meetings_organizer_id_fkey ( name, email ),
  meeting_participants ( profile_id, status, profiles ( name, email ) )
`

/**
 * Møter synlige for `profileId`: der personen er organisator eller invitert deltaker.
 * `profileId` er null kun for admin uten aktivt person-filter — da vises alle møter.
 */
export async function getMeetingsForCalendar(profileId: string | null): Promise<MeetingEvent[]> {
  try {
    const supabase = await createClient()

    if (profileId === null) {
      const { data, error } = await supabase.from('meetings').select(MEETING_SELECT)
      if (error) { console.error('getMeetingsForCalendar (all):', error); return [] }
      return ((data ?? []) as unknown as MeetingRow[]).map(mapMeeting)
    }

    const { data: participantRows } = await supabase
      .from('meeting_participants')
      .select('meeting_id')
      .eq('profile_id', profileId)

    const idsAsParticipant = (participantRows ?? []).map((r) => r.meeting_id as string)
    const orFilter = idsAsParticipant.length > 0
      ? `organizer_id.eq.${profileId},id.in.(${idsAsParticipant.join(',')})`
      : `organizer_id.eq.${profileId}`

    const { data, error } = await supabase.from('meetings').select(MEETING_SELECT).or(orFilter)
    if (error) { console.error('getMeetingsForCalendar:', error); return [] }
    return ((data ?? []) as unknown as MeetingRow[]).map(mapMeeting)
  } catch (err) {
    console.error('getMeetingsForCalendar error:', err)
    return []
  }
}

export type Colleague = { id: string; name: string | null; email: string }

export async function getColleagues(): Promise<Colleague[]> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email')
      .in('role', STAFF_ROLES)
      .order('name', { ascending: true })
    if (error) return []
    return ((data ?? []) as Colleague[]).filter((p) => p.id !== user?.id)
  } catch {
    return []
  }
}

export async function createMeeting(input: {
  title: string
  startsAt: string
  endsAt: string | null
  meetingLink: string | null
  notes: string | null
  participantIds: string[]
}): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!input.title.trim()) return { ok: false, error: 'Møtet trenger en tittel' }
    if (input.participantIds.length === 0) return { ok: false, error: 'Velg minst én kollega' }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Ikke autentisert' }

    const { data: meeting, error } = await supabase
      .from('meetings')
      .insert({
        organizer_id: user.id,
        title: input.title.trim(),
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        meeting_link: input.meetingLink?.trim() || null,
        notes: input.notes?.trim() || null,
      })
      .select('id')
      .single()

    if (error || !meeting) { console.error('createMeeting:', error); return { ok: false, error: 'Kunne ikke opprette møtet' } }

    const participantRows = input.participantIds.map((profileId) => ({
      meeting_id: meeting.id,
      profile_id: profileId,
    }))
    const { error: partError } = await supabase.from('meeting_participants').insert(participantRows)
    if (partError) { console.error('createMeeting participants:', partError); return { ok: false, error: 'Kunne ikke invitere deltakere' } }

    revalidatePath('/admin/calendar')
    return { ok: true }
  } catch (err) {
    console.error('createMeeting error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function updateMeeting(
  meetingId: string,
  input: { title?: string; startsAt?: string; endsAt?: string | null; meetingLink?: string | null; notes?: string | null }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('meetings')
      .update({
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.startsAt !== undefined ? { starts_at: input.startsAt } : {}),
        ...(input.endsAt !== undefined ? { ends_at: input.endsAt } : {}),
        ...(input.meetingLink !== undefined ? { meeting_link: input.meetingLink?.trim() || null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', meetingId)
    if (error) { console.error('updateMeeting:', error); return { ok: false, error: 'Kunne ikke oppdatere møtet' } }
    revalidatePath('/admin/calendar')
    return { ok: true }
  } catch (err) {
    console.error('updateMeeting error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function cancelMeeting(meetingId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('meetings').delete().eq('id', meetingId)
    if (error) { console.error('cancelMeeting:', error); return { ok: false, error: 'Kunne ikke avlyse møtet' } }
    revalidatePath('/admin/calendar')
    return { ok: true }
  } catch (err) {
    console.error('cancelMeeting error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function respondToMeetingInvite(
  meetingId: string,
  status: 'accepted' | 'declined'
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Ikke autentisert' }

    const { error } = await supabase
      .from('meeting_participants')
      .update({ status, responded_at: new Date().toISOString() })
      .eq('meeting_id', meetingId)
      .eq('profile_id', user.id)
    if (error) { console.error('respondToMeetingInvite:', error); return { ok: false, error: 'Kunne ikke svare på invitasjonen' } }

    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('meeting_id', meetingId)
      .eq('user_id', user.id)
      .eq('type', 'meeting_invite')

    revalidatePath('/admin/calendar')
    revalidatePath('/admin/varsler')
    return { ok: true }
  } catch (err) {
    console.error('respondToMeetingInvite error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}
