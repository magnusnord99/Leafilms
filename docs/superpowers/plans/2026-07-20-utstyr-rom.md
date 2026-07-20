# Utstyrsrom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La teamet spore fysisk utstyr i navngitte «rom», hente utstyr til en shoot og levere det tilbake, og erstatte katalog-delen av dagens fritekst-pakkeliste med denne rom-baserte modellen.

**Architecture:** To nye Supabase-tabeller (`equipment_rooms`, `equipment_units`) der hver fysiske enhet peker til en type i `price_catalog` og har nøyaktig én plassering (rom eller shoot). Ny admin-side `/admin/utstyr` for romstyring og flytting. Pre-prod-siden viser hentet lagerutstyr read-only ved siden av den eksisterende fritekst-checklisten.

**Tech Stack:** Next.js App Router (client components + server actions), Supabase (Postgres + RLS), TypeScript strict mode, inline style-objekter fra `lib/admin-theme.ts`/lokal `C`-konstant (etablert mønster i denne kodebasen — ikke Tailwind-klasser på admin-sidene).

## Global Constraints

- Migrasjonsfil i `supabase/migrations/`, nummer `102_` (verifiser med `ls supabase/migrations | tail` rett før filen opprettes — 101 er høyeste i dag).
- RLS **alltid** på nye tabeller — mønster: full tilgang for `authenticated`, ingen anonyme policies (kopier `098_boards.sql`).
- Ingen automatisert testsuite i dette repoet (`package.json` har kun `lint`) — verifiser hvert kodesteg med `npx tsc --noEmit` og `npm run lint`, og gjør manuell ende-til-ende-verifisering i siste oppgave.
- **Aldri** write-operasjoner mot ekte prosjektdata under manuell verifisering — bruk et engangs-testprosjekt.
- Design/palett: admin-sider bruker den lilla paletten (`#181920`/`#7C5CFC`), definert lokalt som `C`-konstant i hver fil (samme mønster som `app/admin/preprod/[id]/page.tsx` og `app/admin/preprod/page.tsx`).
- Spec: `docs/superpowers/specs/2026-07-20-utstyr-rom-design.md` — alle detaljer under er utledet derfra.

---

### Task 1: Databasemigrasjon — `equipment_rooms` og `equipment_units`

**Files:**
- Create: `supabase/migrations/102_equipment_rooms.sql`

**Interfaces:**
- Produces: tabellene `equipment_rooms(id, name, created_at, updated_at)` og `equipment_units(id, catalog_id, unit_label, room_id, checked_out_project_id, checked_out_assignee_id, created_at, updated_at)` med constraint `equipment_units_location_xor`, brukt av Task 3 sine server actions.

- [ ] **Step 1: Skriv migrasjonsfilen**

```sql
-- 102_equipment_rooms.sql
-- Utstyrsrom: fysisk lagerstyring for pakkeliste.
-- Spec: docs/superpowers/specs/2026-07-20-utstyr-rom-design.md
-- To tabeller (equipment_rooms, equipment_units), staff-RLS.
-- Hver equipment_units-rad har nøyaktig én plassering: room_id (i et rom)
-- eller checked_out_project_id (ute til en shoot) — aldri begge, aldri ingen.

CREATE TABLE IF NOT EXISTS equipment_rooms (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_units (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id               UUID NOT NULL REFERENCES price_catalog(id) ON DELETE RESTRICT,
  unit_label               TEXT NOT NULL,
  room_id                  UUID REFERENCES equipment_rooms(id) ON DELETE CASCADE,
  checked_out_project_id   UUID REFERENCES projects(id) ON DELETE RESTRICT,
  checked_out_assignee_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT equipment_units_location_xor CHECK ((room_id IS NULL) <> (checked_out_project_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_equipment_units_room ON equipment_units(room_id);
CREATE INDEX IF NOT EXISTS idx_equipment_units_project ON equipment_units(checked_out_project_id);
CREATE INDEX IF NOT EXISTS idx_equipment_units_catalog ON equipment_units(catalog_id);

-- ---------------------------------------------------------------------------
-- RLS: staff (authenticated) har full tilgang, samme mønster som boards
-- (098_boards.sql). Ingen offentlige policies.
-- ---------------------------------------------------------------------------
ALTER TABLE equipment_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_units ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'equipment_rooms' AND policyname = 'authenticated full access equipment_rooms') THEN
    EXECUTE 'CREATE POLICY "authenticated full access equipment_rooms" ON equipment_rooms FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'equipment_units' AND policyname = 'authenticated full access equipment_units') THEN
    EXECUTE 'CREATE POLICY "authenticated full access equipment_units" ON equipment_units FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END$$;
```

- [ ] **Step 2: Verifiser at 102 faktisk er neste ledige nummer**

Run: `ls /Users/magnusnordmo/Prosjektbeskrivelse_leafilms/leafilms-pitch/supabase/migrations | sort -V | tail -5`
Expected: `101_contract_template_language.sql` er høyeste eksisterende — hvis et `102_*` allerede finnes, gi filen fra Step 1 et nytt, ledig nummer og oppdater filnavnet før du går videre.

- [ ] **Step 3: Kjør migrasjonen mot Supabase**

DATABASE_URL i `.env.local` er IPv6-only og feiler fra denne maskinen — bruk Supavisor-pooleren i stedet (passordet er det samme som i DATABASE_URL):

Run:
```bash
psql "postgresql://postgres.fmwcrgfxmlgfnsinnuyy:<PASSORD>@aws-1-eu-north-1.pooler.supabase.com:5432/postgres" \
  -f supabase/migrations/102_equipment_rooms.sql
```
Expected: `CREATE TABLE` x2, `CREATE INDEX` x3, `ALTER TABLE` x2, `DO` — ingen feilmeldinger.

- [ ] **Step 4: Verifiser tabellene finnes**

Run:
```bash
psql "postgresql://postgres.fmwcrgfxmlgfnsinnuyy:<PASSORD>@aws-1-eu-north-1.pooler.supabase.com:5432/postgres" \
  -c "\d equipment_units"
```
Expected: viser kolonnene `id, catalog_id, unit_label, room_id, checked_out_project_id, checked_out_assignee_id, created_at, updated_at` og constraint `equipment_units_location_xor`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/102_equipment_rooms.sql
git commit -m "Legg til equipment_rooms og equipment_units for utstyrsrom"
```

---

### Task 2: Delt kategori-konstant

**Files:**
- Create: `lib/equipment-constants.ts`

**Interfaces:**
- Produces: `EQUIPMENT_CATEGORY_LABELS: Record<string, string>`, importert av Task 5 (`/admin/utstyr/[roomId]/page.tsx`).

- [ ] **Step 1: Opprett filen**

```ts
export const EQUIPMENT_CATEGORY_LABELS: Record<string, string> = {
  kamera: 'Kamera',
  lys: 'Lys',
  lyd: 'Lyd',
  utstyr: 'Utstyr',
  annet: 'Annet',
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: ingen feil relatert til `lib/equipment-constants.ts` (filen er ikke brukt av noe ennå, så ingen nye feil skal dukke opp).

- [ ] **Step 3: Commit**

```bash
git add lib/equipment-constants.ts
git commit -m "Legg til delt konstant for utstyrskategori-labels"
```

---

### Task 3: Server actions for utstyrsrom

**Files:**
- Create: `lib/actions/equipment.ts`

**Interfaces:**
- Consumes: `createClient` fra `@/lib/supabase-server` (samme mønster som `lib/actions/preprod.ts`/`lib/actions/boards.ts`).
- Produces (brukt av Task 4, 5, 8):
  - `type EquipmentRoom = { id: string; name: string; unit_count: number }`
  - `type EquipmentUnitRow = { id: string; unit_label: string; catalog_id: string; catalog_name: string; catalog_category: string }`
  - `type CheckedOutUnitRow = EquipmentUnitRow & { checked_out_project_id: string; project_title: string }`
  - `type RoomDetail = { room: { id: string; name: string }; unitsInRoom: EquipmentUnitRow[]; unitsCheckedOut: CheckedOutUnitRow[]; catalog: { id: string; name: string; category: string }[]; preprodProjects: { id: string; title: string }[] }`
  - `type ProjectEquipmentUnit = { id: string; unit_label: string; catalog_name: string; catalog_category: string; assignee_id: string | null; assignee_name: string | null }`
  - `getRooms(): Promise<EquipmentRoom[]>`
  - `getRoomDetail(roomId: string): Promise<RoomDetail | null>`
  - `createRoom(name: string): Promise<{ id?: string; error?: string }>`
  - `deleteRoom(roomId: string): Promise<{ error?: string }>`
  - `addEquipmentUnits(roomId: string, catalogId: string, count: number): Promise<{ error?: string }>`
  - `checkOutUnits(unitIds: string[], projectId: string): Promise<void>`
  - `returnUnits(unitIds: string[], roomId: string): Promise<void>`
  - `setUnitAssignee(unitId: string, profileId: string | null): Promise<void>`
  - `getProjectEquipment(projectId: string): Promise<ProjectEquipmentUnit[]>`

- [ ] **Step 1: Opprett filen med alle types og actions**

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: ingen feil i `lib/actions/equipment.ts`.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: ingen nye feil/advarsler for `lib/actions/equipment.ts`.

- [ ] **Step 4: Commit**

```bash
git add lib/actions/equipment.ts
git commit -m "Legg til server actions for utstyrsrom"
```

---

### Task 4: Romoversikt — `/admin/utstyr`

**Files:**
- Create: `app/admin/utstyr/page.tsx`

**Interfaces:**
- Consumes: `getRooms`, `createRoom` fra `@/lib/actions/equipment` (Task 3).

- [ ] **Step 1: Opprett siden**

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getRooms, createRoom, EquipmentRoom } from '@/lib/actions/equipment'

const C = {
  bg:       '#181920',
  surface:  '#21212D',
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text2:    '#B4B4CC',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
  accentBg: 'rgba(124,92,252,0.08)',
  danger:   '#E05555',
}

function RoomCard({ room }: { room: EquipmentRoom }) {
  return (
    <Link href={`/admin/utstyr/${room.id}`} style={{ textDecoration: 'none' }}>
      <div
        style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '18px 20px', cursor: 'pointer', transition: 'border-color 0.12s' }}
        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#3D3D4E'}
        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.border}
      >
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.9rem', fontWeight: 600, color: C.text, marginBottom: 4 }}>
          {room.name}
        </p>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
          {room.unit_count} utstyrsenhet{room.unit_count !== 1 ? 'er' : ''}
        </p>
      </div>
    </Link>
  )
}

export default function UtstyrPage() {
  const router = useRouter()
  const [rooms, setRooms] = useState<EquipmentRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getRooms().then(data => {
      setRooms(data)
      setLoading(false)
    })
  }, [])

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    setError(null)
    const result = await createRoom(newName.trim())
    setCreating(false)
    if (result.error) {
      setError(result.error)
      return
    }
    if (result.id) router.push(`/admin/utstyr/${result.id}`)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>Laster...</p>
      </div>
    )
  }

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '32px 32px 48px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.4rem', fontWeight: 600, color: C.text, marginBottom: 4 }}>
              Utstyr
            </h1>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>
              {rooms.length} rom
            </p>
          </div>
          <button
            onClick={() => setShowNew(v => !v)}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600,
              padding: '8px 14px', borderRadius: 6, cursor: 'pointer',
              background: C.accentBg, color: C.accent, border: '1px solid rgba(124,92,252,0.25)',
            }}
          >
            + Nytt rom
          </button>
        </div>

        {showNew && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 18px', marginBottom: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="Navn på rom, f.eks. «Lager A» eller «Bil 1»"
              autoFocus
              style={{
                flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem',
                color: C.text, background: C.surface2, border: `1px solid ${C.border}`,
                borderRadius: 6, padding: '7px 10px', outline: 'none',
              }}
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600,
                padding: '7px 14px', borderRadius: 6, cursor: newName.trim() ? 'pointer' : 'not-allowed',
                background: newName.trim() ? C.accentBg : 'transparent',
                color: newName.trim() ? C.accent : C.text3,
                border: `1px solid ${newName.trim() ? 'rgba(124,92,252,0.25)' : C.border}`,
              }}
            >
              {creating ? 'Oppretter...' : 'Opprett'}
            </button>
          </div>
        )}

        {error && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.danger, marginBottom: 20 }}>
            {error}
          </p>
        )}

        {rooms.length === 0 ? (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '64px 24px', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.88rem', color: C.text3 }}>
              Ingen rom opprettet ennå
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {rooms.map(r => <RoomCard key={r.id} room={r} />)}
          </div>
        )}

      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck og lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: ingen feil.

- [ ] **Step 3: Commit**

```bash
git add app/admin/utstyr/page.tsx
git commit -m "Legg til romoversikt-side (/admin/utstyr)"
```

---

### Task 5: Romdetalj — hente, levere, legge til utstyr

**Files:**
- Create: `app/admin/utstyr/[roomId]/page.tsx`

**Interfaces:**
- Consumes: `getRoomDetail`, `deleteRoom`, `addEquipmentUnits`, `checkOutUnits`, `returnUnits` fra `@/lib/actions/equipment` (Task 3); `EQUIPMENT_CATEGORY_LABELS` fra `@/lib/equipment-constants` (Task 2).

- [ ] **Step 1: Opprett siden**

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  getRoomDetail, deleteRoom, addEquipmentUnits, checkOutUnits, returnUnits,
  RoomDetail, EquipmentUnitRow, CheckedOutUnitRow,
} from '@/lib/actions/equipment'
import { EQUIPMENT_CATEGORY_LABELS } from '@/lib/equipment-constants'

const C = {
  bg:       '#181920',
  surface:  '#21212D',
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text2:    '#B4B4CC',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
  accentBg: 'rgba(124,92,252,0.08)',
  success:  '#4CAF7D',
  danger:   '#E05555',
}

function UnitRow({
  label, sub, selected, onToggle,
}: {
  label: string; sub: string; selected: boolean; onToggle: () => void
}) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6,
        background: selected ? C.accentBg : C.surface2,
        border: `1px solid ${selected ? 'rgba(124,92,252,0.4)' : C.border}`,
        cursor: 'pointer', transition: 'all 0.12s',
      }}
    >
      <span style={{
        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
        background: selected ? C.accent : 'transparent',
        border: `1.5px solid ${selected ? C.accent : C.text3}`,
      }} />
      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text, flex: 1 }}>
        {label} <span style={{ color: C.text3 }}>{sub}</span>
      </span>
    </div>
  )
}

export default function RoomDetailPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const router = useRouter()

  const [detail, setDetail] = useState<RoomDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [targetProjectId, setTargetProjectId] = useState('')
  const [selectedInRoom, setSelectedInRoom] = useState<Set<string>>(new Set())
  const [selectedCheckedOut, setSelectedCheckedOut] = useState<Set<string>>(new Set())
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addCatalogId, setAddCatalogId] = useState('')
  const [addCount, setAddCount] = useState(1)
  const [addError, setAddError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function load() {
    getRoomDetail(roomId).then(data => {
      setDetail(data)
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [roomId])

  function toggleInRoom(id: string) {
    setSelectedInRoom(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleCheckedOut(id: string) {
    setSelectedCheckedOut(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleCheckOut() {
    if (selectedInRoom.size === 0 || !targetProjectId) return
    setBusy(true)
    await checkOutUnits(Array.from(selectedInRoom), targetProjectId)
    setSelectedInRoom(new Set())
    load()
    setBusy(false)
  }

  async function handleReturn() {
    if (selectedCheckedOut.size === 0) return
    setBusy(true)
    await returnUnits(Array.from(selectedCheckedOut), roomId)
    setSelectedCheckedOut(new Set())
    load()
    setBusy(false)
  }

  async function handleAdd() {
    if (!addCatalogId || addCount <= 0) return
    setAddError(null)
    setBusy(true)
    const result = await addEquipmentUnits(roomId, addCatalogId, addCount)
    setBusy(false)
    if (result.error) {
      setAddError(result.error)
      return
    }
    setShowAdd(false)
    setAddCatalogId('')
    setAddCount(1)
    load()
  }

  async function handleDelete() {
    setDeleteError(null)
    const result = await deleteRoom(roomId)
    if (result.error) {
      setDeleteError(result.error)
      return
    }
    router.push('/admin/utstyr')
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>Laster...</p>
      </div>
    )
  }

  if (!detail) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3 }}>Fant ikke rommet.</p>
      </div>
    )
  }

  const catalogByCategory = detail.catalog.reduce<Record<string, RoomDetail['catalog']>>((acc, item) => {
    (acc[item.category] ??= []).push(item)
    return acc
  }, {})

  const targetProjectTitle = detail.preprodProjects.find(p => p.id === targetProjectId)?.title ?? ''

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '28px 28px 64px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 22 }}>
          <Link href="/admin/utstyr" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, textDecoration: 'none' }}>Utstyr</Link>
          <span style={{ color: C.text3, fontSize: '0.72rem' }}>›</span>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2 }}>{detail.room.name}</span>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.4rem', fontWeight: 600, color: C.text }}>
            {detail.room.name}
          </h1>
          <button
            onClick={handleDelete}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500,
              padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
              background: 'transparent', color: C.text3, border: `1px solid ${C.border}`,
            }}
          >
            Slett rom
          </button>
        </div>
        {deleteError && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.danger, marginBottom: 16 }}>
            {deleteError}
          </p>
        )}

        {/* Mål-shoot */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', marginBottom: 20 }}>
          <label style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, display: 'block', marginBottom: 8 }}>
            Mål-shoot
          </label>
          <select
            value={targetProjectId}
            onChange={e => setTargetProjectId(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem',
              color: C.text, background: C.surface2, border: `1px solid ${C.border}`,
              borderRadius: 6, padding: '8px 10px', outline: 'none', cursor: 'pointer',
            }}
          >
            <option value="">Velg prosjekt...</option>
            {detail.preprodProjects.map(p => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>

        {/* I dette rommet */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 18px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3 }}>
              I dette rommet
            </p>
            <button
              onClick={() => setShowAdd(v => !v)}
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 500,
                padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                background: 'transparent', color: C.accent, border: '1px solid rgba(124,92,252,0.25)',
              }}
            >
              + Legg til utstyr
            </button>
          </div>

          {showAdd && (
            <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12, marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={addCatalogId}
                onChange={e => setAddCatalogId(e.target.value)}
                style={{
                  flex: 1, minWidth: 180, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem',
                  color: C.text, background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 6, padding: '7px 10px', outline: 'none', cursor: 'pointer',
                }}
              >
                <option value="">Velg type...</option>
                {Object.entries(catalogByCategory).map(([category, items]) => (
                  <optgroup key={category} label={EQUIPMENT_CATEGORY_LABELS[category] ?? category}>
                    {items.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={addCount}
                onChange={e => setAddCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{
                  width: 64, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem',
                  color: C.text, background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 6, padding: '7px 10px', outline: 'none',
                }}
              />
              <button
                onClick={handleAdd}
                disabled={!addCatalogId || busy}
                style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600,
                  padding: '7px 12px', borderRadius: 6, cursor: addCatalogId ? 'pointer' : 'not-allowed',
                  background: addCatalogId ? C.accentBg : 'transparent',
                  color: addCatalogId ? C.accent : C.text3,
                  border: `1px solid ${addCatalogId ? 'rgba(124,92,252,0.25)' : C.border}`,
                }}
              >
                Legg til
              </button>
              {addError && (
                <p style={{ width: '100%', fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.danger, margin: 0 }}>
                  {addError}
                </p>
              )}
            </div>
          )}

          {detail.unitsInRoom.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, fontStyle: 'italic' }}>
              Ingen utstyr i dette rommet
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {detail.unitsInRoom.map((u: EquipmentUnitRow) => (
                <UnitRow
                  key={u.id}
                  label={u.catalog_name}
                  sub={u.unit_label}
                  selected={selectedInRoom.has(u.id)}
                  onToggle={() => toggleInRoom(u.id)}
                />
              ))}
            </div>
          )}

          {selectedInRoom.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2 }}>
                {selectedInRoom.size} valgt
              </span>
              <button
                onClick={handleCheckOut}
                disabled={!targetProjectId || busy}
                style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600,
                  padding: '7px 12px', borderRadius: 6,
                  cursor: targetProjectId ? 'pointer' : 'not-allowed',
                  background: targetProjectId ? C.accentBg : 'transparent',
                  color: targetProjectId ? C.accent : C.text3,
                  border: `1px solid ${targetProjectId ? 'rgba(124,92,252,0.25)' : C.border}`,
                }}
              >
                {targetProjectId ? `Flytt ${selectedInRoom.size} til «${targetProjectTitle}»` : 'Velg mål-shoot først'}
              </button>
            </div>
          )}
        </div>

        {/* Ute til shoot */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 18px' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 14 }}>
            Ute til shoot
          </p>

          {detail.unitsCheckedOut.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, fontStyle: 'italic' }}>
              Ingenting er ute akkurat nå
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {detail.unitsCheckedOut.map((u: CheckedOutUnitRow) => (
                <UnitRow
                  key={u.id}
                  label={u.catalog_name}
                  sub={`${u.unit_label} · ute til ${u.project_title}`}
                  selected={selectedCheckedOut.has(u.id)}
                  onToggle={() => toggleCheckedOut(u.id)}
                />
              ))}
            </div>
          )}

          {selectedCheckedOut.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2 }}>
                {selectedCheckedOut.size} valgt
              </span>
              <button
                onClick={handleReturn}
                disabled={busy}
                style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600,
                  padding: '7px 12px', borderRadius: 6, cursor: 'pointer',
                  background: 'rgba(76,175,125,0.12)', color: C.success, border: '1px solid rgba(76,175,125,0.3)',
                }}
              >
                Lever inn her ({selectedCheckedOut.size})
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck og lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: ingen feil.

- [ ] **Step 3: Commit**

```bash
git add "app/admin/utstyr/[roomId]/page.tsx"
git commit -m "Legg til romdetalj-side med hent/lever/legg-til-utstyr"
```

---

### Task 6: Navigasjon og rolletilgang

**Files:**
- Modify: `app/admin/layout.tsx`
- Modify: `lib/permissions.ts`

**Interfaces:**
- Consumes: eksisterende `NavGroup`/`NavItem`-typer i `app/admin/layout.tsx`, `PATH_ROLES`-lignende liste i `lib/permissions.ts`.

- [ ] **Step 1: Legg til nav-lenke i Produksjon-gruppen**

Modify `app/admin/layout.tsx` — i `navGroups`, gruppen med `label: 'Produksjon'`:

```ts
  {
    label: 'Produksjon',
    items: [
      { href: '/admin/calendar', label: 'Kalender' },
      { href: '/admin/preprod',    label: 'Pre-prod' },
      { href: '/admin/utstyr',     label: 'Utstyr' },
      { href: '/admin/boards',     label: 'Boards' },
      { href: '/admin/postprod',   label: 'Post-prod' },
      { href: '/admin/selections',  label: 'Gallerier' },
      { href: '/admin/transfers',   label: 'Leveranser' },
    ],
  },
```

(Kun linjen `{ href: '/admin/utstyr', label: 'Utstyr' },` er ny — resten av gruppen er uendret, vist for kontekst.)

- [ ] **Step 2: Legg til rolletilgang**

Modify `lib/permissions.ts` — legg til `equipment_units`-siden i lista med sti-prefikser (samme sted som `/admin/preprod` og `/admin/boards`):

```ts
  { prefix: '/admin/preprod', roles: ['admin', 'production'] },
  { prefix: '/admin/utstyr', roles: ['admin', 'production'] },
  { prefix: '/admin/boards', roles: ['admin', 'production'] },
```

(Kun `{ prefix: '/admin/utstyr', roles: ['admin', 'production'] },` er ny.)

- [ ] **Step 3: Typecheck og lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: ingen feil.

- [ ] **Step 4: Commit**

```bash
git add app/admin/layout.tsx lib/permissions.ts
git commit -m "Legg til Utstyr i admin-navigasjon og rolletilgang"
```

---

### Task 7: Fjern ubrukt priskatalog-kobling fra pre-prod actions

**Files:**
- Modify: `lib/actions/preprod.ts:90-178`

**Interfaces:**
- Produces (endret): `PreprodDetail` mister feltet `equipmentCatalog`; `EquipmentCatalogItem`-typen fjernes. `getPreprodDetail` returnerer ikke lenger `equipmentCatalog`.

Katalogvalget i pakkelisten (`price_catalog` → fritekst-rad) erstattes av rom-basert utstyr i Task 8, så denne koblingen blir dødt kode.

- [ ] **Step 1: Fjern `EquipmentCatalogItem`-typen og `equipmentCatalog`-feltet**

Erstatt blokken fra `export type EquipmentCatalogItem = {` til slutten av `getPreprodDetail` (linje 90–178) med:

```ts
export type PreprodDetail = {
  project: ProjectWithPipeline & { preprod: PreprodData; quote_equipment: { name: string }[] }
  tasks: Task[]
  profiles: { id: string; name: string | null; email: string; color: string | null }[]
}

export async function getPreprodDetail(projectId: string): Promise<PreprodDetail | null> {
  try {
    const supabase = await createClient()

    const { data: project, error: pErr } = await supabase
      .from('projects')
      .select('*, customers(id, name, company), project_lead:profiles!project_lead_id(id, name, email)')
      .eq('id', projectId)
      .single()

    if (pErr || !project) return null

    const { data: tasks } = await supabase
      .from('tasks')
      .select('*, task_assignees(profile:profiles(id, name, email))')
      .eq('project_id', projectId)
      .eq('pipeline_stage', 'pre_prod')
      .order('sort_order', { ascending: true })

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, email, color')
      .order('name', { ascending: true })

    // Hent utstyr fra gjeldende quote-versjon
    const { data: quotes } = await supabase
      .from('quotes')
      .select('quote_data')
      .eq('project_id', projectId)
      .eq('is_current', true)
      .not('quote_data', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)

    const quoteEquipment: { name: string }[] = []
    const quoteData = quotes?.[0]?.quote_data as { equipment?: { description?: string }[] } | undefined
    if (quoteData?.equipment) {
      for (const item of quoteData.equipment) {
        if (item.description) quoteEquipment.push({ name: item.description })
      }
    }

    const pd = (project.pipeline_data as PipelineData) ?? {}
    const preprod: PreprodData = { ...DEFAULT_PREPROD, ...(pd.preprod ?? {}) }

    return {
      project: {
        ...project,
        customer: project.customers ?? null,
        project_lead: (project as { project_lead?: ProjectWithPipeline['project_lead'] }).project_lead ?? null,
        preprod,
        quote_equipment: quoteEquipment,
      },
      tasks: (tasks ?? []).map((t: TaskRow) => ({
        ...t,
        assignees: (t.task_assignees ?? [])
          .map((ta) => ta.profile)
          .filter((pr): pr is NonNullable<typeof pr> => pr !== null),
      })),
      profiles: (profiles ?? []) as { id: string; name: string | null; email: string; color: string | null }[],
    }
  } catch (err) {
    console.error('getPreprodDetail error:', err)
    return null
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: feil i `app/admin/preprod/[id]/page.tsx` (bruker fortsatt `EquipmentCatalogItem`/`equipmentCatalog`) — dette er forventet og fikses i Task 8. Bekreft at feilene kun er i den filen, ikke andre.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/preprod.ts
git commit -m "Fjern ubrukt priskatalog-kobling fra pre-prod actions"
```

---

### Task 8: Erstatt katalogvalg i pre-prod-pakkelisten med rom-utstyr

**Files:**
- Modify: `app/admin/preprod/[id]/page.tsx:1-16` (imports)
- Modify: `app/admin/preprod/[id]/page.tsx:128-417` (`PackingAssignee`, `EQUIPMENT_CATEGORY_LABELS`, `PackingList`)
- Modify: `app/admin/preprod/[id]/page.tsx:1109-1146` (state og datahenting)
- Modify: `app/admin/preprod/[id]/page.tsx:1400-1408` (render av pakkeliste-widget)

**Interfaces:**
- Consumes: `getProjectEquipment`, `setUnitAssignee`, `type ProjectEquipmentUnit` fra `@/lib/actions/equipment` (Task 3).
- Produces: `AssigneePicker` (generisk avløser for `PackingAssignee`), `PackingSection` (avløser for `PackingList`) — begge lokale til denne filen, ingen andre filer avhenger av dem.

- [ ] **Step 1: Oppdater imports**

Erstatt import-blokken (linje 6-10):

```tsx
import {
  getPreprodDetail, updatePreprodData, updatePreprodTaskStatus, syncPostCrewToTask,
  getPitchTeamAsProdCrew, setTildelTaskStatus, PreprodData, PreprodCrewMember, PackingItem,
} from '@/lib/actions/preprod'
```

Legg til rett under (etter linjen med `toggleTaskAssignee, ...` fra `@/lib/actions/pipeline`):

```tsx
import { getProjectEquipment, setUnitAssignee, type ProjectEquipmentUnit } from '@/lib/actions/equipment'
```

- [ ] **Step 2: Erstatt `PackingAssignee`, `EQUIPMENT_CATEGORY_LABELS` og `PackingList` med `AssigneePicker` og `PackingSection`**

Erstatt hele blokken fra `function PackingAssignee({` (linje 128) til slutten av `PackingList`-funksjonen (linje 417) — dette fjerner både den gamle `PackingAssignee`-funksjonen og `EQUIPMENT_CATEGORY_LABELS`-konstanten i samme slag, så ingen av delene blir liggende igjen som ubrukt kode — med:

```tsx
function AssigneePicker({
  assignedId, assignedName, candidates, onAssign,
}: {
  assignedId: string | null
  assignedName: string | null
  candidates: PackingCandidate[]
  onAssign: (assignee: PackingCandidate | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const assigned = assignedId
    ? { id: assignedId, name: assignedName ?? '?', color: candidates.find(c => c.id === assignedId)?.color ?? null }
    : null

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0, lineHeight: 0 }}>
      <button
        onClick={() => setOpen(v => !v)}
        title={assigned ? `Tas med av ${assigned.name}` : 'Tildel hvem som tar med'}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 0 }}
      >
        {assigned ? (
          <Avatar id={assigned.id} name={assigned.name} color={assigned.color} size={20} />
        ) : (
          <span style={{
            width: 20, height: 20, borderRadius: '50%', boxSizing: 'border-box',
            border: `1.5px dashed ${C.text3}`, color: C.text3,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600,
            transition: 'border-color 0.12s, color 0.12s',
          }}>
            +
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 50,
          background: C.surface2, border: `1px solid ${C.border}`,
          borderRadius: 8, minWidth: 190, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          padding: '4px 0',
        }}>
          {candidates.length === 0 && (
            <p style={{ padding: '8px 12px', margin: 0, fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, fontStyle: 'italic' }}>
              Ingen personer tilgjengelig
            </p>
          )}
          {assigned && (
            <>
              <button
                onClick={() => { setOpen(false); onAssign(null) }}
                style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}
              >
                Fjern tildeling
              </button>
              <div style={{ height: 1, background: C.border }} />
            </>
          )}
          {candidates.map(cand => (
            <button
              key={cand.id}
              onClick={() => { setOpen(false); onAssign(cand) }}
              style={{
                width: '100%', textAlign: 'left', padding: '7px 12px',
                background: cand.id === assignedId ? `${C.accent}14` : 'none',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-dm-sans)',
              }}
            >
              <Avatar id={cand.id} name={cand.name} color={cand.color} size={18} />
              <span style={{ fontSize: '0.78rem', color: C.text, fontWeight: cand.id === assignedId ? 600 : 400 }}>{cand.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function PackingSection({
  projectId, freetextItems, quoteEquipment, storageUnits, prodCrew, profiles,
  onFreetextChange, onAssignUnit,
}: {
  projectId: string
  freetextItems: PackingItem[]
  quoteEquipment: { name: string }[]
  storageUnits: ProjectEquipmentUnit[]
  prodCrew: PreprodCrewMember[]
  profiles: { id: string; name: string | null; email: string; color: string | null }[]
  onFreetextChange: (items: PackingItem[]) => void
  onAssignUnit: (unitId: string, assignee: PackingCandidate | null) => void
}) {
  const [newItem, setNewItem] = useState('')
  const candidates = buildPackingCandidates(prodCrew, profiles)

  function save(next: PackingItem[]) {
    onFreetextChange(next)
    updatePreprodData(projectId, { packing_list: next })
  }

  function addItem() {
    if (!newItem.trim()) return
    const next = [...freetextItems, { id: crypto.randomUUID(), name: newItem.trim(), qty: 1, checked: false }]
    setNewItem('')
    save(next)
  }

  function toggleItem(id: string) {
    save(freetextItems.map(i => i.id === id ? { ...i, checked: !i.checked } : i))
  }

  function removeItem(id: string) {
    save(freetextItems.filter(i => i.id !== id))
  }

  function assignItem(id: string, assignee: PackingCandidate | null) {
    save(freetextItems.map(i => i.id === id
      ? { ...i, assignee_id: assignee?.id ?? null, assignee_name: assignee?.name ?? null }
      : i
    ))
  }

  function importFromQuote() {
    const existing = new Set(freetextItems.map(i => i.name.toLowerCase()))
    const toAdd = quoteEquipment
      .filter(e => !existing.has(e.name.toLowerCase()))
      .map(e => ({ id: crypto.randomUUID(), name: e.name, qty: 1, checked: false }))
    if (toAdd.length > 0) save([...freetextItems, ...toAdd])
  }

  const freetextDone = freetextItems.filter(i => i.checked).length
  const totalDone = freetextDone + storageUnits.length
  const totalCount = freetextItems.length + storageUnits.length

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <SectionTitle>
          Pakkeliste {totalCount > 0 && `(${totalDone}/${totalCount})`}
        </SectionTitle>
        {quoteEquipment.length > 0 && (
          <button
            onClick={importFromQuote}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 500,
              padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
              background: 'transparent', color: C.text3, border: `1px solid ${C.border}`,
            }}
          >
            Importer fra tilbud
          </button>
        )}
      </div>

      {/* Utstyr fra lager */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 600, color: C.text3 }}>
            Utstyr fra lager
          </p>
          <Link
            href="/admin/utstyr"
            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.accent, textDecoration: 'none' }}
          >
            Hent mer utstyr →
          </Link>
        </div>
        {storageUnits.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, fontStyle: 'italic' }}>
            Ingen utstyr hentet fra lager ennå
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {storageUnits.map(unit => (
              <div key={unit.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 6, background: C.surface2, border: `1px solid ${C.border}` }}>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text, flex: 1 }}>
                  {unit.catalog_name} <span style={{ color: C.text3 }}>{unit.unit_label}</span>
                </span>
                <AssigneePicker
                  assignedId={unit.assignee_id}
                  assignedName={unit.assignee_name}
                  candidates={candidates}
                  onAssign={assignee => onAssignUnit(unit.id, assignee)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Annet utstyr */}
      <div>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 600, color: C.text3, marginBottom: 8 }}>
          Annet utstyr
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: freetextItems.length > 0 ? 12 : 0 }}>
          <input
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem()}
            placeholder="Skriv inn utstyr..."
            style={{
              flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem',
              color: C.text, background: C.surface2, border: `1px solid ${C.border}`,
              borderRadius: 6, padding: '7px 10px', outline: 'none', transition: 'border-color 0.12s',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
            onBlur={e => { e.currentTarget.style.borderColor = C.border }}
          />
          <button
            onClick={addItem}
            disabled={!newItem.trim()}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600,
              padding: '7px 12px', borderRadius: 6, cursor: newItem.trim() ? 'pointer' : 'not-allowed',
              background: newItem.trim() ? C.accentBg : 'transparent',
              color: newItem.trim() ? C.accent : C.text3,
              border: `1px solid ${newItem.trim() ? 'rgba(124,92,252,0.25)' : C.border}`,
              transition: 'all 0.12s',
            }}
          >
            + Legg til
          </button>
        </div>

        {freetextItems.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {freetextItems.map(item => (
              <div
                key={item.id}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 6, background: C.surface2, border: `1px solid ${C.border}` }}
              >
                <button
                  onClick={() => toggleItem(item.id)}
                  style={{
                    width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
                    background: item.checked ? 'rgba(76,175,125,0.2)' : 'transparent',
                    border: `1.5px solid ${item.checked ? C.success : C.text3}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                    transition: 'all 0.12s',
                  }}
                >
                  {item.checked && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5L4 7.5L8.5 2.5" stroke={C.success} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <span style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem',
                  color: item.checked ? C.text3 : C.text,
                  textDecoration: item.checked ? 'line-through' : 'none',
                  flex: 1,
                }}>
                  {item.name}
                </span>
                <AssigneePicker
                  assignedId={item.assignee_id ?? null}
                  assignedName={item.assignee_name ?? null}
                  candidates={candidates}
                  onAssign={assignee => assignItem(item.id, assignee)}
                />
                <button
                  onClick={() => removeItem(item.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, padding: 2, lineHeight: 0, transition: 'color 0.12s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = C.danger }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.text3 }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M2 2l8 8M10 2L2 10" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Oppdater state og datahenting i hovedkomponenten**

I `PreprodDetailPage` (fra linje ~1109), fjern:

```tsx
  const [equipmentCatalog, setEquipmentCatalog] = useState<EquipmentCatalogItem[]>([])
```

Legg til i stedet:

```tsx
  const [storageUnits, setStorageUnits] = useState<ProjectEquipmentUnit[]>([])
```

I `useEffect`-blokken som kaller `getPreprodDetail`, fjern linjen `setEquipmentCatalog(detail.equipmentCatalog)` og legg til et eget kall utenfor `.then()`-blokken:

```tsx
  useEffect(() => {
    getPreprodDetail(id).then(detail => {
      if (detail) {
        setProject(detail.project)
        setTasks(detail.tasks)
        setProfiles(detail.profiles)
        setPreprod(detail.project.preprod)
        setProjectLead_(detail.project.project_lead
          ? { ...detail.project.project_lead, color: detail.profiles.find(p => p.id === detail.project.project_lead!.id)?.color ?? null }
          : null)
        if (detail.tasks.length > 0) {
          getTaskMessageCounts(detail.tasks.map(t => t.id)).then(setMessageCounts)
        }
      }
      setLoading(false)
    })
    getProjectEquipment(id).then(setStorageUnits)
    getCurrentUserProfile().then(profile => setCurrentUserId(profile?.id ?? null))
  }, [id])
```

Legg til en ny handler-funksjon (f.eks. rett under `patchPreprod`):

```tsx
  function handleAssignUnit(unitId: string, assignee: PackingCandidate | null) {
    setStorageUnits(prev => prev.map(u => u.id === unitId
      ? { ...u, assignee_id: assignee?.id ?? null, assignee_name: assignee?.name ?? null }
      : u
    ))
    setUnitAssignee(unitId, assignee?.id ?? null)
  }
```

- [ ] **Step 4: Oppdater render-kallet**

Erstatt:

```tsx
            <PackingList
              items={preprod.packing_list}
              projectId={id}
              quoteEquipment={project.quote_equipment}
              equipmentCatalog={equipmentCatalog}
              prodCrew={preprod.prod_crew}
              profiles={profiles}
              onChange={next => patchPreprod({ packing_list: next })}
            />
```

med:

```tsx
            <PackingSection
              projectId={id}
              freetextItems={preprod.packing_list}
              quoteEquipment={project.quote_equipment}
              storageUnits={storageUnits}
              prodCrew={preprod.prod_crew}
              profiles={profiles}
              onFreetextChange={next => patchPreprod({ packing_list: next })}
              onAssignUnit={handleAssignUnit}
            />
```

- [ ] **Step 5: Typecheck og lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: ingen feil, verken i denne filen eller `lib/actions/preprod.ts`.

- [ ] **Step 6: Commit**

```bash
git add "app/admin/preprod/[id]/page.tsx"
git commit -m "Bytt ut priskatalog-dropdown i pakkelisten med rom-basert lagerutstyr"
```

---

### Task 9: Manuell ende-til-ende-verifisering

**Files:** Ingen kodeendringer — kun manuell klikk-gjennomgang mot dev-serveren.

**Interfaces:** N/A.

- [ ] **Step 1: Start dev-server**

Run: `npm run dev`
Expected: server starter uten feil på `localhost:3000`.

- [ ] **Step 2: Opprett to rom**

Naviger til `/admin/utstyr` → «+ Nytt rom» → opprett «Testrom A» og «Testrom B».
Expected: begge rommene vises i oversikten med 0 utstyrsenheter.

- [ ] **Step 3: Legg til utstyr og verifiser auto-nummerering**

Åpne «Testrom A» → «+ Legg til utstyr» → velg en type (f.eks. «Sony FX3») → antall 3 → Legg til.
Expected: tre rader dukker opp i «I dette rommet»: `Sony FX3 #1`, `Sony FX3 #2`, `Sony FX3 #3`.

- [ ] **Step 4: Hent utstyr til et engangs-testprosjekt**

Velg et **engangs-testprosjekt** i pre-prod (opprett ett om nødvendig — ikke bruk ekte prosjektdata) som mål-shoot i Testrom A → velg 2 av de 3 enhetene → «Flytt 2 til «testprosjekt»».
Expected: de 2 enhetene forsvinner fra «I dette rommet» (kun 1 igjen). Åpne Testrom B → «Ute til shoot» viser de samme 2 enhetene med riktig prosjektnavn (verifiserer at status vises på tvers av rom).

- [ ] **Step 5: Lever tilbake til et annet rom enn opprinnelsen**

I Testrom B, velg de 2 «ute»-enhetene → «Lever inn her».
Expected: enhetene forsvinner fra «Ute til shoot», dukker opp i Testrom B sin «I dette rommet»-liste (ikke Testrom A).

- [ ] **Step 6: Verifiser pre-prod-siden**

Åpne testprosjektets pre-prod-side.
Expected: «Utstyr fra lager»-seksjonen i pakkelisten viser de 2 enhetene (siden de nå er tilbake i et rom, ikke lenger ute — de bør IKKE lenger vises her). Gjenta steg 4 for å hente utstyr til shooten på nytt, og bekreft at de nå dukker opp under «Utstyr fra lager» med riktig navn/label. Tildel en bærer via avatar-knappen og verifiser at valget lagres (last siden på nytt, tildelingen skal fortsatt stå).

- [ ] **Step 7: Verifiser at fritekstlisten fortsatt fungerer**

I «Annet utstyr»-seksjonen: skriv inn et fritekst-navn og legg til, huk det av, tildel en bærer, fjern det igjen.
Expected: alt fungerer som før endringen (uendret oppførsel).

- [ ] **Step 8: Verifiser sletting av rom**

Prøv å slette Testrom A (som fortsatt har 1 enhet i seg) → forvent feilmelding «Rommet inneholder utstyr». Flytt/lever inn den siste enheten et annet sted, prøv å slette Testrom A på nytt → skal lykkes og navigere tilbake til romoversikten. Slett Testrom B på samme måte.
Expected: begge testrommene er borte fra `/admin/utstyr` etter at de er tomme.

- [ ] **Step 9: Full build**

Run: `npm run build`
Expected: bygget fullfører uten feil.
