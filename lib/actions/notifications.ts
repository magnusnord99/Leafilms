'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'

export type Notification = {
  id: string
  type: 'project_message' | 'task_message'
  project_id: string
  task_id: string | null
  message_preview: string
  sender_name: string
  read: boolean
  created_at: string
  projects: { title: string } | null
  tasks: { title: string } | null
}

export async function getNotifications(): Promise<Notification[]> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
      .from('notifications')
      .select('*, projects(title), tasks(title)')
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
