'use server'

import { createClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { getAllProfiles } from '@/lib/actions/pipeline'

export type EquipmentRoom = { id: string; name: string; unit_count: number }

export type EquipmentUnitRow = {
  id: string
  unit_label: string
  catalog_id: string
  catalog_name: string
  catalog_category: string
  reservations: { project_id: string; project_title: string; shoot_start: string | null }[]
}

export type CheckedOutUnitRow = {
  id: string
  unit_label: string
  catalog_id: string
  catalog_name: string
  catalog_category: string
  project_id: string
  project_title: string
}

export type CatalogLocation =
  | { kind: 'room'; room_name: string }
  | { kind: 'shoot'; project_title: string; shoot_start: string | null }

export type RoomDetail = {
  room: { id: string; name: string; owner_id: string | null }
  unitsInRoom: EquipmentUnitRow[]
  unitsCheckedOut: CheckedOutUnitRow[]
  catalog: { id: string; name: string; category: string; existingElsewhere: CatalogLocation[] }[]
  preprodProjects: { id: string; title: string }[]
  staff: { id: string; name: string | null }[]
}

export type ProjectEquipmentUnit = {
  id: string
  unit_label: string
  catalog_name: string
  catalog_category: string
  assignee_id: string | null
  assignee_name: string | null
  room_id: string | null
  room_name: string | null
  packed: boolean
}

type CatalogJoin = { name: string; category: string } | null
type ProjectJoin = { title: string; shoot_start: string | null; shoot_end: string | null } | null
type AssigneeJoin = { id: string; name: string | null } | null

/** En reservert enhet regnes som fysisk "ute" fra og med prosjektets shoot_start.
 *  Mangler shoot_start helt, regnes den som ute med det samme (bevarer gammel oppførsel
 *  for prosjekter uten satt dato — vi kan ikke vite at den *ikke* er ute). */
function isPhysicallyOut(shootStart: string | null): boolean {
  if (!shootStart) return true
  return shootStart <= new Date().toISOString().slice(0, 10)
}

/** To datointervaller overlapper. Mangler dato på noen av sidene kan vi ikke bevise
 *  at de IKKE overlapper — vær konservativ og flagg som overlapp (samme prinsipp som
 *  isPhysicallyOut). */
function rangesOverlap(
  aStart: string | null, aEnd: string | null,
  bStart: string | null, bEnd: string | null
): boolean {
  if (!aStart || !bStart) return true
  const aEndEff = aEnd ?? aStart
  const bEndEff = bEnd ?? bStart
  return aStart <= bEndEff && bStart <= aEndEff
}

export async function getPreprodProjects(): Promise<{ id: string; title: string }[]> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('projects')
      .select('id, title')
      .eq('pipeline_stage', 'pre_prod')
      .order('title', { ascending: true })

    return data ?? []
  } catch (err) {
    console.error('getPreprodProjects error:', err)
    return []
  }
}

/** Prosjekt-tittel + om prosjektets utstyr-reservasjoner regnes som fysisk ute
 *  (shoot har startet) eller kun forhåndsplanlagt. Brukes av valgt-utstyr-panelet
 *  for å avgjøre om "Fjern" skal avreservere eller levere tilbake. */
export async function getProjectMeta(projectId: string): Promise<{ title: string; physicallyOut: boolean } | null> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('projects')
      .select('title, shoot_start')
      .eq('id', projectId)
      .single()

    if (!data) return null
    return { title: data.title, physicallyOut: isPhysicallyOut(data.shoot_start) }
  } catch (err) {
    console.error('getProjectMeta error:', err)
    return null
  }
}

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
      .select('id, name, owner_id')
      .eq('id', roomId)
      .single()

    if (!room) return null

    // Enheter med hjemme-rom = dette rommet. Kan ha 0-N fremtidige reservasjoner
    // (til ulike prosjekter, ulike datoer) uten å være fysisk ute ennå.
    const { data: roomUnits } = await supabase
      .from('equipment_units')
      .select('id, unit_label, catalog_id, price_catalog(name, category), equipment_reservations(project_id, projects(title, shoot_start, shoot_end))')
      .eq('room_id', roomId)
      .order('unit_label', { ascending: true })

    // Fysisk ute til shoot: reservasjon der shoot har startet (eller ingen dato satt).
    // Ikke rom-avgrenset — hver enhet peker uansett tilbake til hjemme-rommet sitt.
    const { data: allReservations } = await supabase
      .from('equipment_reservations')
      .select('unit_id, project_id, equipment_units(unit_label, catalog_id, price_catalog(name, category)), projects(title, shoot_start, shoot_end)')

    const { data: catalog } = await supabase
      .from('price_catalog')
      .select('id, name, category')
      .in('category', ['kamera', 'objektiver', 'lys', 'lyd', 'utstyr', 'annet'])
      .order('category', { ascending: true })
      .order('name', { ascending: true })

    // Hvor finnes enheter av hvert katalogprodukt allerede (i ANDRE rom, eller ute
    // til shoot)? Vises i "+ Legg til utstyr" slik at man ikke oppretter en ny
    // enhet uten å vite at objektet allerede finnes et sted (skal kun ligge ett sted).
    const { data: allUnitsForCatalog } = await supabase
      .from('equipment_units')
      .select('catalog_id, room_id, equipment_rooms(name), equipment_reservations(project_id, projects(title, shoot_start))')

    const locationsByCatalog: Record<string, CatalogLocation[]> = {}
    for (const u of allUnitsForCatalog ?? []) {
      const catalogId = u.catalog_id as string
      const roomRow = u.equipment_rooms as unknown as { name: string } | null
      const resRows = (u.equipment_reservations ?? []) as unknown as { project_id: string; projects: ProjectJoin }[]
      const activeRes = resRows.find(r => isPhysicallyOut(r.projects?.shoot_start ?? null))
      if (activeRes) {
        (locationsByCatalog[catalogId] ??= []).push({
          kind: 'shoot',
          project_title: activeRes.projects?.title ?? '?',
          shoot_start: activeRes.projects?.shoot_start ?? null,
        })
      } else if (u.room_id && u.room_id !== roomId) {
        (locationsByCatalog[catalogId] ??= []).push({ kind: 'room', room_name: roomRow?.name ?? '?' })
      }
    }

    const preprodProjects = await getPreprodProjects()

    const staff = await getAllProfiles()

    const unitsInRoom: EquipmentUnitRow[] = []
    for (const u of roomUnits ?? []) {
      const catalogRow = u.price_catalog as unknown as CatalogJoin
      const resRows = (u.equipment_reservations ?? []) as unknown as { project_id: string; projects: ProjectJoin }[]
      const activeNow = resRows.some(r => isPhysicallyOut(r.projects?.shoot_start ?? null))
      if (activeNow) continue
      unitsInRoom.push({
        id: u.id,
        unit_label: u.unit_label,
        catalog_id: u.catalog_id,
        catalog_name: catalogRow?.name ?? '?',
        catalog_category: catalogRow?.category ?? 'annet',
        reservations: resRows.map(r => ({
          project_id: r.project_id,
          project_title: r.projects?.title ?? '?',
          shoot_start: r.projects?.shoot_start ?? null,
        })),
      })
    }

    const unitsCheckedOut: CheckedOutUnitRow[] = []
    for (const r of allReservations ?? []) {
      const projectRow = r.projects as unknown as ProjectJoin
      if (!isPhysicallyOut(projectRow?.shoot_start ?? null)) continue
      const unitRow = r.equipment_units as unknown as { unit_label: string; catalog_id: string; price_catalog: CatalogJoin } | null
      unitsCheckedOut.push({
        id: r.unit_id,
        unit_label: unitRow?.unit_label ?? '?',
        catalog_id: unitRow?.catalog_id ?? '',
        catalog_name: unitRow?.price_catalog?.name ?? '?',
        catalog_category: unitRow?.price_catalog?.category ?? 'annet',
        project_id: r.project_id,
        project_title: projectRow?.title ?? '?',
      })
    }

    return {
      room,
      unitsInRoom,
      unitsCheckedOut,
      catalog: (catalog ?? []).map(c => ({ ...c, existingElsewhere: locationsByCatalog[c.id] ?? [] })),
      preprodProjects,
      staff: staff.map(p => ({ id: p.id, name: p.name })),
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

export type BookingConflict = {
  unit_label: string
  catalog_name: string
  project_title: string
  shoot_start: string | null
}

export async function checkOutUnits(
  unitIds: string[],
  projectId: string
): Promise<{ error?: string; conflicts?: BookingConflict[] }> {
  if (unitIds.length === 0) return {}

  try {
    const supabase = await createClient()

    const { data: targetProject } = await supabase
      .from('projects')
      .select('shoot_start, shoot_end')
      .eq('id', projectId)
      .single()

    const { data: units } = await supabase
      .from('equipment_units')
      .select('id, room_id, unit_label, price_catalog(name), equipment_reservations(project_id, projects(title, shoot_start, shoot_end))')
      .in('id', unitIds)

    // Dobbeltbooking-sperre: flagg kun reservasjoner til ANDRE prosjekt hvis
    // shoot-datoene faktisk overlapper. Ikke-overlappende reservasjoner (samme
    // enhet, ulike datoer) sameksisterer i equipment_reservations uten problem.
    const conflicts: BookingConflict[] = []
    for (const u of units ?? []) {
      const catalogRow = u.price_catalog as unknown as { name: string } | null
      const resRows = (u.equipment_reservations ?? []) as unknown as { project_id: string; projects: ProjectJoin }[]
      for (const r of resRows) {
        if (r.project_id === projectId) continue
        if (rangesOverlap(
          targetProject?.shoot_start ?? null, targetProject?.shoot_end ?? null,
          r.projects?.shoot_start ?? null, r.projects?.shoot_end ?? null
        )) {
          conflicts.push({
            unit_label: u.unit_label,
            catalog_name: catalogRow?.name ?? '?',
            project_title: r.projects?.title ?? '?',
            shoot_start: r.projects?.shoot_start ?? null,
          })
        }
      }
    }

    if (conflicts.length > 0) {
      return { error: 'Noe av utstyret er allerede reservert til et annet prosjekt i samme periode', conflicts }
    }

    // Rom med eier gir automatisk pakke-ansvar til eieren ved reservering.
    const roomIds = Array.from(new Set((units ?? []).map(u => u.room_id).filter((id): id is string => !!id)))
    const { data: rooms } = roomIds.length
      ? await supabase.from('equipment_rooms').select('id, owner_id').in('id', roomIds)
      : { data: [] }
    const ownerByRoom = new Map((rooms ?? []).map(r => [r.id, r.owner_id]))

    const rows = (units ?? []).map(u => ({
      unit_id: u.id,
      project_id: projectId,
      assignee_id: u.room_id ? ownerByRoom.get(u.room_id) ?? null : null,
      updated_at: new Date().toISOString(),
    }))

    const { error } = await supabase
      .from('equipment_reservations')
      .upsert(rows, { onConflict: 'unit_id,project_id' })

    if (error) return { error: error.message }

    revalidatePath('/admin/utstyr')
    revalidatePath(`/admin/preprod/${projectId}`)
    return {}
  } catch (err) {
    console.error('checkOutUnits error:', err)
    return { error: 'Kunne ikke reservere utstyr' }
  }
}

/** Avreserverer spesifikke (enhet, prosjekt)-par som ennå ikke er fysisk ute
 *  (før shoot_start). Rommet er uendret siden enhetene aldri forlot det. */
export async function cancelReservation(entries: { unitId: string; projectId: string }[]): Promise<void> {
  if (entries.length === 0) return

  try {
    const supabase = await createClient()

    await Promise.all(entries.map(e =>
      supabase.from('equipment_reservations').delete().eq('unit_id', e.unitId).eq('project_id', e.projectId)
    ))

    revalidatePath('/admin/utstyr')

    const projectIds = new Set(entries.map(e => e.projectId))
    for (const projectId of projectIds) {
      revalidatePath(`/admin/preprod/${projectId}`)
    }
  } catch (err) {
    console.error('cancelReservation error:', err)
  }
}

export async function setRoomOwner(roomId: string, ownerId: string | null): Promise<{ error?: string }> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('equipment_rooms')
      .update({ owner_id: ownerId, updated_at: new Date().toISOString() })
      .eq('id', roomId)

    if (error) return { error: error.message }

    revalidatePath(`/admin/utstyr/${roomId}`)
    return {}
  } catch (err) {
    console.error('setRoomOwner error:', err)
    return { error: 'Kunne ikke sette rom-eier' }
  }
}

export async function returnUnits(unitIds: string[], roomId: string): Promise<void> {
  if (unitIds.length === 0) return

  try {
    const supabase = await createClient()

    // Kun den AKTIVE reservasjonen (shoot har startet) avsluttes — eventuelle
    // fremtidige reservasjoner på samme enhet til andre prosjekt består.
    const { data: reservations } = await supabase
      .from('equipment_reservations')
      .select('unit_id, project_id, projects(shoot_start)')
      .in('unit_id', unitIds)

    const activeByUnit = new Map<string, string>()
    for (const r of reservations ?? []) {
      const projectRow = r.projects as unknown as { shoot_start: string | null } | null
      if (isPhysicallyOut(projectRow?.shoot_start ?? null)) {
        activeByUnit.set(r.unit_id, r.project_id)
      }
    }

    await Promise.all(Array.from(activeByUnit.entries()).map(([unitId, projectId]) =>
      supabase.from('equipment_reservations').delete().eq('unit_id', unitId).eq('project_id', projectId)
    ))

    await supabase
      .from('equipment_units')
      .update({ room_id: roomId, updated_at: new Date().toISOString() })
      .in('id', unitIds)

    revalidatePath('/admin/utstyr')
    revalidatePath(`/admin/utstyr/${roomId}`)

    const projectIds = new Set(activeByUnit.values())
    for (const projectId of projectIds) {
      revalidatePath(`/admin/preprod/${projectId}`)
    }
  } catch (err) {
    console.error('returnUnits error:', err)
  }
}

export async function setUnitAssignee(unitId: string, projectId: string, profileId: string | null): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase
      .from('equipment_reservations')
      .update({ assignee_id: profileId, updated_at: new Date().toISOString() })
      .eq('unit_id', unitId)
      .eq('project_id', projectId)
  } catch (err) {
    console.error('setUnitAssignee error:', err)
  }
}

export async function setUnitPacked(unitId: string, projectId: string, packed: boolean): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase
      .from('equipment_reservations')
      .update({ packed, updated_at: new Date().toISOString() })
      .eq('unit_id', unitId)
      .eq('project_id', projectId)
  } catch (err) {
    console.error('setUnitPacked error:', err)
  }
}

export async function getProjectEquipment(projectId: string): Promise<ProjectEquipmentUnit[]> {
  try {
    const supabase = await createClient()

    const { data } = await supabase
      .from('equipment_reservations')
      .select('assignee_id, packed, equipment_units(id, unit_label, room_id, price_catalog(name, category), equipment_rooms(name)), assignee:profiles!assignee_id(id, name)')
      .eq('project_id', projectId)

    return (data ?? [])
      .map((r): ProjectEquipmentUnit => {
        const unitRow = r.equipment_units as unknown as { id: string; unit_label: string; room_id: string | null; price_catalog: CatalogJoin; equipment_rooms: { name: string } | null } | null
        const assigneeRow = r.assignee as unknown as AssigneeJoin
        return {
          id: unitRow?.id ?? '',
          unit_label: unitRow?.unit_label ?? '?',
          catalog_name: unitRow?.price_catalog?.name ?? '?',
          catalog_category: unitRow?.price_catalog?.category ?? 'annet',
          assignee_id: r.assignee_id,
          assignee_name: assigneeRow?.name ?? null,
          room_id: unitRow?.room_id ?? null,
          room_name: unitRow?.equipment_rooms?.name ?? null,
          packed: (r as unknown as { packed: boolean }).packed ?? false,
        }
      })
      .sort((a, b) => a.unit_label.localeCompare(b.unit_label))
  } catch (err) {
    console.error('getProjectEquipment error:', err)
    return []
  }
}
