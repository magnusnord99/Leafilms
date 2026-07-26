'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'

export type CustomerInvoiceInfoPatch = {
  company?: string | null
  org_nummer?: string | null
  address?: string | null
  invoice_email?: string | null
  invoice_reference?: string | null
  invoice_info_skipped?: boolean
}

/**
 * Oppdaterer fakturafeltene på en kunde (samme felt som samles inn ved
 * kontraktsignering i app/api/contracts/sign/route.ts), slik at de kan
 * rettes/fylles inn manuelt fra Kontrakt-fanen eller kundesiden.
 */
export async function updateCustomerInvoiceInfo(
  customerId: string,
  patch: CustomerInvoiceInfoPatch,
  projectId?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('customers')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', customerId)

    if (error) return { ok: false, error: 'Kunne ikke oppdatere fakturainformasjon' }

    revalidatePath(`/admin/customers/${customerId}`)
    revalidatePath('/admin/faktura')
    if (projectId) {
      revalidatePath(`/admin/projects/${projectId}`)
      revalidatePath(`/admin/faktura/${projectId}`)
    }
    return { ok: true }
  } catch (err) {
    console.error('updateCustomerInvoiceInfo unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}
