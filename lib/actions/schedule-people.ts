'use server'

import { createClient, createServiceClient } from '@/lib/supabase-server'
import type { CustomerContact, ResolvedSchedulePerson, SchedulePersonRef } from '@/lib/types'

export type CustomerMatch = { id: string; name: string; company: string | null }
export type TeamMemberOption = { id: string; name: string; role: string; email: string | null; phone: string | null }

const now = () => new Date().toISOString()

export async function searchCustomers(query: string): Promise<CustomerMatch[]> {
  // Fjerner tegn som ville brutt PostgREST sin .or()-filterstreng-syntaks.
  const safe = query.trim().replace(/[,()%]/g, '')
  if (safe.length < 2) return []
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('customers')
      .select('id, name, company')
      .or(`name.ilike.%${safe}%,company.ilike.%${safe}%`)
      .order('name')
      .limit(20)
    return (data ?? []) as CustomerMatch[]
  } catch (err) {
    console.error('searchCustomers:', err)
    return []
  }
}

export async function getCustomerContacts(customerId: string): Promise<CustomerContact[]> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('customer_contacts')
      .select('*')
      .eq('customer_id', customerId)
      .order('is_primary', { ascending: false })
      .order('name')
    return (data ?? []) as CustomerContact[]
  } catch (err) {
    console.error('getCustomerContacts:', err)
    return []
  }
}

export async function createCustomerContact(input: {
  customer_id: string; name: string; email?: string | null; phone?: string | null; role?: string | null
}): Promise<CustomerContact | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.from('customer_contacts').insert({
      customer_id: input.customer_id,
      name: input.name.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      role: input.role?.trim() || null,
      is_primary: false,
    }).select('*').single()
    if (error) { console.error('createCustomerContact:', error); return null }
    return data as CustomerContact
  } catch (err) {
    console.error('createCustomerContact:', err)
    return null
  }
}

export async function updateCustomerContact(id: string, patch: {
  name?: string; email?: string | null; phone?: string | null; role?: string | null
}): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('customer_contacts')
      .update({ ...patch, updated_at: now() }).eq('id', id)
    return !error
  } catch (err) {
    console.error('updateCustomerContact:', err)
    return false
  }
}

export async function deleteCustomerContact(id: string): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('customer_contacts').delete().eq('id', id)
    return !error
  } catch (err) {
    console.error('deleteCustomerContact:', err)
    return false
  }
}

export async function listTeamMembers(): Promise<TeamMemberOption[]> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('team_members')
      .select('id, name, role, email, phone')
      .order('order_index')
    return (data ?? []) as TeamMemberOption[]
  } catch (err) {
    console.error('listTeamMembers:', err)
    return []
  }
}

export async function updateTeamMemberContact(id: string, patch: {
  email?: string | null; phone?: string | null
}): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('team_members')
      .update({ ...patch, updated_at: now() }).eq('id', id)
    return !error
  } catch (err) {
    console.error('updateTeamMemberContact:', err)
    return false
  }
}

/**
 * Slår opp visningsdata for en liste referanser. Bruker service-klienten når
 * kalleren er anonym (offentlig delt board, /b/[token]) siden RLS på
 * customer_contacts/team_members krever authenticated — samme mønster som
 * getSharedBoard bruker for å lese boards/board_cards anonymt.
 */
export async function resolveSchedulePeople(refs: SchedulePersonRef[]): Promise<ResolvedSchedulePerson[]> {
  if (refs.length === 0) return []
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const db = user ? supabase : createServiceClient()

    const contactIds = refs.filter(r => r.type === 'customer_contact').map(r => r.id)
    const teamIds = refs.filter(r => r.type === 'team_member').map(r => r.id)
    const resolved: ResolvedSchedulePerson[] = []

    if (contactIds.length > 0) {
      const { data } = await db.from('customer_contacts').select('id, name, role, email, phone').in('id', contactIds)
      for (const c of data ?? []) {
        resolved.push({ ref: { type: 'customer_contact', id: c.id }, name: c.name, role: c.role, email: c.email, phone: c.phone })
      }
    }
    if (teamIds.length > 0) {
      const { data } = await db.from('team_members').select('id, name, role, email, phone').in('id', teamIds)
      for (const t of data ?? []) {
        resolved.push({ ref: { type: 'team_member', id: t.id }, name: t.name, role: t.role, email: t.email, phone: t.phone })
      }
    }
    return resolved
  } catch (err) {
    console.error('resolveSchedulePeople:', err)
    return []
  }
}
