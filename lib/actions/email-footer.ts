'use server'

import { createClient } from '@/lib/supabase-server'

const ROW_ID = 'main'

export type EmailFooterTemplate = { template: string; updatedAt: string | null }

export async function getEmailFooterTemplate(): Promise<EmailFooterTemplate> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('email_footer_template')
    .select('template, updated_at')
    .eq('id', ROW_ID)
    .maybeSingle()
  return { template: data?.template ?? '', updatedAt: data?.updated_at ?? null }
}

export async function updateEmailFooterTemplate(template: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  await supabase
    .from('email_footer_template')
    .update({ template, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })
    .eq('id', ROW_ID)
}
