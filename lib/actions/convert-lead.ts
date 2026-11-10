'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'

export type LeadCustomerInput = {
  name: string
  orgNumber: string
  address: string
  contactName: string
  email: string
  phone: string
  existingCustomerId: string
}

export async function convertLeadToCustomer(leadId: string, input: LeadCustomerInput): Promise<{ customerId: string } | { error: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Du må være logget inn.' }

    const { data, error } = await supabase.rpc('convert_lead_to_customer', {
      p_lead_id: leadId,
      p_name: input.name.trim(),
      p_org_nummer: input.orgNumber.trim(),
      p_address: input.address.trim(),
      p_contact_name: input.contactName.trim(),
      p_email: input.email.trim(),
      p_phone: input.phone.trim(),
      p_existing_customer_id: input.existingCustomerId || null,
    })
    if (error || !data) {
      console.error('convertLeadToCustomer:', error)
      return { error: error?.code === 'P0001' ? error.message : 'Kunne ikke gjøre leaden til kunde. Prøv igjen.' }
    }

    revalidatePath('/admin/leads')
    revalidatePath(`/admin/leads/${leadId}`)
    revalidatePath('/admin/customers')
    revalidatePath('/admin/projects', 'layout')
    revalidatePath('/admin/pipeline')
    return { customerId: data as string }
  } catch (error) {
    console.error('convertLeadToCustomer:', error)
    return { error: 'Kunne ikke gjøre leaden til kunde. Prøv igjen.' }
  }
}
