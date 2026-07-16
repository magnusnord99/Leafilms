'use server'

import { createClient, createServiceClient } from '@/lib/supabase-server'

export async function submitFeedback(
  type: 'bug' | 'wish',
  message: string,
  pageUrl: string,
  priority: 1 | 2 | 3,
  imagePath?: string,
): Promise<{ error?: string }> {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  const supabase = createServiceClient()
  const { error } = await supabase.from('feedback').insert({
    type,
    message,
    page_url: pageUrl,
    created_by: user?.id ?? null,
    priority,
    image_path: imagePath ?? null,
  })
  if (error) {
    console.error('submitFeedback error:', error)
    return { error: error.message }
  }
  return {}
}

export async function deleteFeedback(id: string): Promise<void> {
  const supabase = createServiceClient()
  await supabase.from('feedback').delete().eq('id', id)
}

export async function updateFeedbackStatus(
  id: string,
  status: 'open' | 'in_progress' | 'resolved',
): Promise<void> {
  const supabase = createServiceClient()
  await supabase.from('feedback').update({ status }).eq('id', id)
}

export async function replyToFeedback(id: string, reply: string): Promise<{ error?: string }> {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return { error: 'Ikke innlogget' }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('feedback')
    .update({ admin_reply: reply, replied_at: new Date().toISOString(), replied_by: user.id })
    .eq('id', id)
  if (error) {
    console.error('replyToFeedback error:', error)
    return { error: error.message }
  }
  return {}
}

export type FeedbackItem = {
  id: string
  type: 'bug' | 'wish'
  message: string
  page_url: string | null
  created_by: string | null
  created_at: string
  priority: 1 | 2 | 3
  status: 'open' | 'in_progress' | 'resolved'
  image_path: string | null
  admin_reply: string | null
  replied_at: string | null
  replied_by: string | null
}

export async function getFeedback(): Promise<{ items: FeedbackItem[]; error?: string }> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('feedback')
    .select('*')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) {
    console.error('getFeedback error:', error)
    return { items: [], error: error.message }
  }
  return { items: (data ?? []) as FeedbackItem[] }
}
