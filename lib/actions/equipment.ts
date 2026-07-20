'use server'

import { createClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'

export type EquipmentRoom = { id: string; name: string; unit_count: number }

export type EquipmentUnitRow = {
  id: string
  unit_label: string
  catalog_id: string
  catalog_name: string
  catalog_category: string
}

export type CheckedOutUnitRow = EquipmentUnitRow & {
  checked_out_project_id: string
  project_title: string
}

export type RoomDetail = {
  room: { id: string; name: string }
  unitsInRoom: EquipmentUnitRow[]
  unitsCheckedOut: CheckedOutUnitRow[]
  catalog: { id: string; name: string; category: string }[]
  preprodProjects: { id: string; title: string }[]
}

export type ProjectEquipmentUnit = {
  id: string
  unit_label: string
  catalog_name: string
  catalog_category: string
  assignee_id: string | null
  assignee_name: string | null
}

type CatalogJoin = { name: string; category: string } | null
type ProjectJoin = { title: string } | null
type AssigneeJoin = { id: string; name: string | null } | null

export async function getRooms(): Promise<EquipmentRoom[]> {
  try {
    const supabase = await createClient()

    const { data: rooms } = await supabase
      .from('equipment_rooms')
      .select('id, name')
      .order('name', { ascending: true })

    if (!rooms?.length) return []

    const { data: units } = await supabase
      .from('equipment_units')
      .select('room_id')
      .not('room_id', 'is', null)

    const counts: Record<string, number> = {}
    for (const u of units ?? []) {
      const roomId = u.room_id as string
      counts[roomId] = (counts[roomId] ?? 0) + 1
    }

    return rooms.map(r => ({ id: r.id, name: r.name, unit_count: counts[r.id] ?? 0 }))
  } catch (err) {
    console.error('getRooms error:', err)
    return []
  }
}

export async function getRoomDetail(roomId: string): Promise<RoomDetail | null> {
  try {
    const supabase = await createClient()

    const { data: room } = await supabase
      .from('equipment_rooms')
      .select('id, name')
      .eq('id', roomId)
      .single()

    if (!room) return null

    const { data: unitsInRoom } = await supabase
      .from('equipment_units')
      .select('id, unit_label, catalog_id, price_catalog(name, category)')
      .eq('room_id', roomId)
      .order('unit_label', { ascending: true })

    const { data: unitsCheckedOut } = await supabase
      .from('equipment_units')
      .select('id, unit_label, catalog_id, checked_out_project_id, price_catalog(name, category), projects(title)')
      .not('checked_out_project_id', 'is', null)

    const { data: catalog } = await supabase
      .from('price_catalog')
      .select('id, name, category')
      .in('category', ['kamera', 'lys', 'lyd', 'utstyr', 'annet'])
      .order('category', { ascending: true })
      .order('name', { ascending: true })

    const { data: preprodProjects } = await supabase
      .from('projects')
      .select('id, title')
      .eq('pipeline_stage', 'pre_prod')
      .order('title', { ascending: true })

    return {
      room,
      unitsInRoom: (unitsInRoom ?? []).map((u): EquipmentUnitRow => {
        const catalogRow = u.price_catalog as unknown as CatalogJoin
        return {
          id: u.id,
          unit_label: u.unit_label,
          catalog_id: u.catalog_id,
          catalog_name: catalogRow?.name ?? '?',
          catalog_category: catalogRow?.category ?? 'annet',
        }
      }),
      unitsCheckedOut: (unitsCheckedOut ?? []).map((u): CheckedOutUnitRow => {
        const catalogRow = u.price_catalog as unknown as CatalogJoin
        const projectRow = u.projects as unknown as ProjectJoin
        return {
          id: u.id,
          unit_label: u.unit_label,
          catalog_id: u.catalog_id,
          catalog_name: catalogRow?.name ?? '?',
          catalog_category: catalogRow?.category ?? 'annet',
          checked_out_project_id: u.checked_out_project_id as string,
          project_title: projectRow?.title ?? '?',
        }
      }),
      catalog: catalog ?? [],
      preprodProjects: preprodProjects ?? [],
    }
  } catch (err) {
    console.error('getRoomDetail error:', err)
    return null
  }
}

export async function createRoom(name: string): Promise<{ id?: string; error?: string }> {
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Navn kan ikke være tomt' }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('equipment_rooms')
      .insert({ name: trimmed })
      .select('id')
      .single()

    if (error || !data) return { error: error?.message ?? 'Kunne ikke opprette rom' }

    revalidatePath('/admin/utstyr')
    return { id: data.id }
  } catch (err) {
    console.error('createRoom error:', err)
    return { error: 'Kunne ikke opprette rom' }
  }
}

export async function deleteRoom(roomId: string): Promise<{ error?: string }> {
  try {
    const supabase = await createClient()

    const { count } = await supabase
      .from('equipment_units')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', roomId)

    if ((count ?? 0) > 0) return { error: 'Rommet inneholder utstyr' }

    const { error } = await supabase.from('equipment_rooms').delete().eq('id', roomId)
    if (error) return { error: error.message }

    revalidatePath('/admin/utstyr')
    return {}
  } catch (err) {
    console.error('deleteRoom error:', err)
    return { error: 'Kunne ikke slette rom' }
  }
}

export async function addEquipmentUnits(
  roomId: string,
  catalogId: string,
  count: number
): Promise<{ error?: string }> {
  if (count <= 0) return { error: 'Antall må være minst 1' }

  try {
    const supabase = await createClient()

    const { count: existingCount } = await supabase
      .from('equipment_units')
      .select('id', { count: 'exact', head: true })
      .eq('catalog_id', catalogId)

    const start = (existingCount ?? 0) + 1
    const rows = Array.from({ length: count }, (_, i) => ({
      catalog_id: catalogId,
      unit_label: `#${start + i}`,
      room_id: roomId,
    }))

    const { error } = await supabase.from('equipment_units').insert(rows)
    if (error) return { error: error.message }

    revalidatePath(`/admin/utstyr/${roomId}`)
    revalidatePath('/admin/utstyr')
    return {}
  } catch (err) {
    console.error('addEquipmentUnits error:', err)
    return { error: 'Kunne ikke legge til utstyr' }
  }
}

export async function checkOutUnits(unitIds: string[], projectId: string): Promise<void> {
  if (unitIds.length === 0) return

  try {
    const supabase = await createClient()
    await supabase
      .from('equipment_units')
      .update({ room_id: null, checked_out_project_id: projectId, updated_at: new Date().toISOString() })
      .in('id', unitIds)

    revalidatePath('/admin/utstyr')
    revalidatePath(`/admin/preprod/${projectId}`)
  } catch (err) {
    console.error('checkOutUnits error:', err)
  }
}

export async function returnUnits(unitIds: string[], roomId: string): Promise<void> {
  if (unitIds.length === 0) return

  try {
    const supabase = await createClient()

    const { data: units } = await supabase
      .from('equipment_units')
      .select('id, checked_out_project_id')
      .in('id', unitIds)

    await supabase
      .from('equipment_units')
      .update({
        room_id: roomId,
        checked_out_project_id: null,
        checked_out_assignee_id: null,
        updated_at: new Date().toISOString(),
      })
      .in('id', unitIds)

    revalidatePath('/admin/utstyr')
    revalidatePath(`/admin/utstyr/${roomId}`)

    const projectIds = new Set((units ?? []).map(u => u.checked_out_project_id).filter(Boolean))
    for (const projectId of projectIds) {
      revalidatePath(`/admin/preprod/${projectId}`)
    }
  } catch (err) {
    console.error('returnUnits error:', err)
  }
}

export async function setUnitAssignee(unitId: string, profileId: string | null): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase
      .from('equipment_units')
      .update({ checked_out_assignee_id: profileId, updated_at: new Date().toISOString() })
      .eq('id', unitId)
  } catch (err) {
    console.error('setUnitAssignee error:', err)
  }
}

export async function getProjectEquipment(projectId: string): Promise<ProjectEquipmentUnit[]> {
  try {
    const supabase = await createClient()

    const { data } = await supabase
      .from('equipment_units')
      .select('id, unit_label, price_catalog(name, category), checked_out_assignee_id, assignee:profiles!checked_out_assignee_id(id, name)')
      .eq('checked_out_project_id', projectId)
      .order('unit_label', { ascending: true })

    return (data ?? []).map((u): ProjectEquipmentUnit => {
      const catalogRow = u.price_catalog as unknown as CatalogJoin
      const assigneeRow = u.assignee as unknown as AssigneeJoin
      return {
        id: u.id,
        unit_label: u.unit_label,
        catalog_name: catalogRow?.name ?? '?',
        catalog_category: catalogRow?.category ?? 'annet',
        assignee_id: u.checked_out_assignee_id,
        assignee_name: assigneeRow?.name ?? null,
      }
    })
  } catch (err) {
    console.error('getProjectEquipment error:', err)
    return []
  }
}
