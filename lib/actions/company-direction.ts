'use server'

import { createClient } from '@/lib/supabase-server'

const ROW_ID = 'main'

export type CompanyDirection = { contentHtml: string; updatedAt: string | null }

export async function getCompanyDirection(): Promise<CompanyDirection> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('company_direction')
    .select('content_html, updated_at')
    .eq('id', ROW_ID)
    .maybeSingle()
  return { contentHtml: data?.content_html ?? '', updatedAt: data?.updated_at ?? null }
}

export async function updateCompanyDirection(html: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  await supabase
    .from('company_direction')
    .update({ content_html: html, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })
    .eq('id', ROW_ID)
}
