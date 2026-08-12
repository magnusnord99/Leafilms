'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { AdminTask, TaskStatus } from '@/lib/types'

type AdminTaskRow = {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  assignee_id: string | null
  due_date: string | null
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
  assignee: { id: string; name: string | null; email: string; color: string | null } | { id: string; name: string | null; email: string; color: string | null }[] | null
  project: { id: string; title: string } | { id: string; title: string }[] | null
}

function mapRow(row: AdminTaskRow): AdminTask {
  const assignee = Array.isArray(row.assignee) ? row.assignee[0] ?? null : row.assignee
  const project = Array.isArray(row.project) ? row.project[0] ?? null : row.project
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    assignee,
    due_date: row.due_date,
    sort_order: row.sort_order,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    project,
  }
}

export async function getAdminTasks(): Promise<AdminTask[]> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('admin_tasks')
      .select('*, assignee:profiles!admin_tasks_assignee_id_fkey(id, name, email, color), project:projects(id, title)')
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('getAdminTasks error:', error)
      return []
    }

    return (data ?? []).map((row) => mapRow(row as AdminTaskRow))
  } catch (err) {
    console.error('getAdminTasks unexpected error:', err)
    return []
  }
}

export async function createAdminTask(title: string, dueDate?: string | null): Promise<AdminTask | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data: existing, error: maxError } = await supabase
      .from('admin_tasks')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)

    if (maxError) {
      console.error('createAdminTask maxError:', maxError)
      return null
    }

    const nextSortOrder = (existing && existing.length > 0 ? existing[0].sort_order : 0) + 1

    const { data: created, error } = await supabase
      .from('admin_tasks')
      .insert({
        title,
        status: 'todo' as const,
        sort_order: nextSortOrder,
        created_by: user?.id ?? null,
        due_date: dueDate ?? null,
      })
      .select('*, assignee:profiles!admin_tasks_assignee_id_fkey(id, name, email, color), project:projects(id, title)')
      .single()

    if (error) {
      console.error('createAdminTask error:', error)
      return null
    }

    revalidatePath('/admin/internal')

    return mapRow(created as AdminTaskRow)
  } catch (err) {
    console.error('createAdminTask unexpected error:', err)
    return null
  }
}

// NB: joiner ikke inn project her — project_id-kolonnen på admin_tasks (migrasjon 140)
// er ikke kjørt mot Supabase ennå.
export async function getMyInternalTasks(): Promise<AdminTask[]> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
      .from('admin_tasks')
      .select('*, assignee:profiles!admin_tasks_assignee_id_fkey(id, name, email, color)')
      .eq('assignee_id', user.id)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('getMyInternalTasks error:', error)
      return []
    }

    return (data ?? []).map((row) => mapRow({ ...(row as AdminTaskRow), project: null }))
  } catch (err) {
    console.error('getMyInternalTasks unexpected error:', err)
    return []
  }
}

export async function updateAdminTaskDueDate(id: string, dueDate: string | null): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase
      .from('admin_tasks')
      .update({ due_date: dueDate, updated_at: new Date().toISOString() })
      .eq('id', id)

    revalidatePath('/admin/internal')
  } catch (err) {
    console.error('updateAdminTaskDueDate error:', err)
  }
}

export async function updateAdminTaskStatus(id: string, status: TaskStatus): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase
      .from('admin_tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)

    revalidatePath('/admin/internal')
  } catch (err) {
    console.error('updateAdminTaskStatus error:', err)
  }
}

export async function getAdminProfiles(): Promise<{ id: string; name: string | null; email: string; color: string | null }[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, color')
      .eq('role', 'admin')
      .order('name', { ascending: true })

    if (error) {
      console.error('getAdminProfiles error:', error)
      return []
    }
    return data ?? []
  } catch (err) {
    console.error('getAdminProfiles unexpected error:', err)
    return []
  }
}

export async function updateAdminTaskAssignee(id: string, assigneeId: string | null): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    if (assigneeId) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', assigneeId)
        .single()

      if (profileError || !profile || profile.role !== 'admin') {
        return { ok: false, error: 'Admin-oppgaver kan kun tildeles admin-brukere' }
      }
    }

    const { error } = await supabase
      .from('admin_tasks')
      .update({ assignee_id: assigneeId, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      console.error('updateAdminTaskAssignee error:', error)
      return { ok: false, error: 'Kunne ikke tildele oppgaven' }
    }

    revalidatePath('/admin/internal')
    return { ok: true }
  } catch (err) {
    console.error('updateAdminTaskAssignee unexpected error:', err)
    return { ok: false, error: 'Kunne ikke tildele oppgaven' }
  }
}

export async function deleteAdminTask(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('admin_tasks').delete().eq('id', id)

    if (error) {
      console.error('deleteAdminTask error:', error)
      return { ok: false, error: 'Kunne ikke slette oppgaven' }
    }

    revalidatePath('/admin/internal')

    return { ok: true }
  } catch (err) {
    console.error('deleteAdminTask unexpected error:', err)
    return { ok: false, error: 'Kunne ikke slette oppgaven' }
  }
}
