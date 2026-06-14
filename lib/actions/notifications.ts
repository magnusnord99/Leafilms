'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'

export type Notification = {
  id: string
  type: 'project_message' | 'task_message' | 'selection_submitted' | 'task_assigned' | 'lead_assigned' | 'quote_assigned'
  project_id: string | null
  task_id: string | null
  lead_id: string | null
  message_preview: string
  sender_name: string
  read: boolean
  created_at: string
  projects: { title: string } | null
  tasks: { title: string } | null
  leads: { name: string; company: string | null } | null
}

export async function getNotifications(): Promise<Notification[]> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
      .from('notifications')
      .select('*, projects(title), tasks(title), leads(name, company)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) return []
    return (data ?? []) as Notification[]
  } catch {
    return []
  }
}

export async function getUnreadCount(): Promise<number> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 0

    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('read', false)

    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}

export async function markAsRead(id: string): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    revalidatePath('/admin/varsler')
  } catch {}
}

export async function markAllAsRead(): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false)
    revalidatePath('/admin/varsler')
  } catch {}
}
