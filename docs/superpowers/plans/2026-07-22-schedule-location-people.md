# Timeplan: lokasjon + folk (kunde-kontakter og team) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La timeplan-kortet ("schedule"-korttypen) på boardet ta lokasjon (fritekst + valgfri Google Maps-lenke) og folk (kunde-kontaktpersoner og team-medlemmer) per programpunkt, med klikkbar kontaktinfo og gjenbrukbare kontaktpersoner på tvers av prosjekter.

**Architecture:** Ny `customer_contacts`-tabell (flere kontaktpersoner per kunde, backfillet fra dagens ett-felt-kontakt på `customers`). `BoardScheduleItem` utvides med `location`, `locationLink` og `people` (kun `{type, id}`-referanser, ikke kopiert kontaktinfo). Et nytt server-actions-modul (`lib/actions/schedule-people.ts`) håndterer søk/opprettelse/oppdatering av kontakter og henter team-medlemmer, samt batch-oppløsning av referanser til visningsdata (`resolveSchedulePeople`). `ScheduleNode.tsx` får en ny per-kort React-hook (`useResolvedPeople`) som slår opp navn/kontaktinfo for akkurat de referansene som brukes på det kortet — ingen endring i `getBoardData`/`BoardData`/`boardContext` er nødvendig, siden oppslaget skjer lokalt i kortet, ikke globalt for hele boardet. To nye UI-komponenter (`PersonPicker`, `PersonChip`) legges i en ny `components/boards/nodes/schedule/`-mappe. Kundesiden (`app/admin/customers/[id]/edit`) får en enkel "Kontaktpersoner"-seksjon som bruker de samme server actions.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (Postgres + RLS), React Flow (`@xyflow/react`) for board-canvas, ingen automatisert test-rammeverk i repoet (verifiseres manuelt via `npm run dev` + `npx tsc --noEmit`).

## Global Constraints

- Migrasjoner ligger i `supabase/migrations/`, nummerert fortløpende — siste er `116_storyline_grid.sql`, så denne planen bruker `117_`.
- **Alltid sett opp RLS på nye tabeller** (CLAUDE.md) — bruk samme idempotente `DO $$ ... IF NOT EXISTS ... $$` mønster som `098_boards.sql` og `authenticated full access <table>`-policynavn.
- Ingen automatisert testsuite finnes i dette repoet (verifisert: ingen jest/vitest-config, ingen `.test.ts(x)`-filer utenfor `node_modules`). Hvert steg som ellers ville vært "skriv test → kjør → implementer" er derfor erstattet med: implementer → kjør `npx tsc --noEmit` (type-sikkerhet) → verifiser manuelt i nettleser via `npm run dev` (konkret handling og forventet resultat er beskrevet per steg) → commit.
- Følg eksisterende mønstre: inline `style={{...}}`-objekter (ikke Tailwind) inni board-canvas-komponenter, med farger fra `useBoardUi().palette` (`P.text`, `P.surface2`, osv.) — se `ScheduleNode.tsx`. Admin-sider utenfor boardet (kundesiden) bruker `C` fra `lib/admin-theme.ts` i stedet — de to palettene skal ikke blandes (se `feedback_palette` i minnet).
- `DATABASE_URL` er kjent for å feile fordi den er IPv6-only i dette miljøet — hvis migrasjonssteget feiler med en tilkoblingsfeil, bruk pooler-tilkoblingen (`aws-1-eu-north-1.pooler.supabase.com`, bruker `postgres.<project-ref>`) i stedet, ikke den direkte DB-hosten.
- `customer_contacts` og `team_members` er kun lesbare for `authenticated` (RLS). Offentlige delte board-sider (`/b/[token]`) er anonyme, så personoppløsning der må gå via `createServiceClient()` (samme mønster som `getSharedBoard` allerede bruker for anonym lesetilgang).

---

### Task 1: Migrasjon — `customer_contacts`-tabell + backfill

**Files:**
- Create: `supabase/migrations/117_customer_contacts.sql`

**Interfaces:**
- Produces: tabellen `customer_contacts(id, customer_id, name, email, phone, role, is_primary, created_at, updated_at)` som senere tasks leser/skriver via Supabase-klienten.

- [ ] **Step 1: Skriv migrasjonsfilen**

```sql
-- 117_customer_contacts.sql
-- Kontaktpersoner per kunde — customers-tabellen har i dag kun ett kontaktfelt
-- (name/email/phone) inline. Denne tabellen lar en kunde ha flere kontaktpersoner,
-- brukt av "legg til person"-velgeren på timeplan-kort på boardet (schedule-korttype).

CREATE TABLE IF NOT EXISTS customer_contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  role        TEXT,
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer ON customer_contacts(customer_id);

ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_contacts' AND policyname = 'authenticated full access customer_contacts') THEN
    EXECUTE 'CREATE POLICY "authenticated full access customer_contacts" ON customer_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END$$;

-- Backfill: gjør eksisterende ett-felt-kontakt på customers om til en primær rad,
-- slik at ingen eksisterende kontaktdata går tapt. Idempotent (kjøres kun for kunder
-- som ikke allerede har en rad i customer_contacts).
INSERT INTO customer_contacts (customer_id, name, email, phone, is_primary)
SELECT id, name, email, phone, true
FROM customers
WHERE NOT EXISTS (
  SELECT 1 FROM customer_contacts WHERE customer_contacts.customer_id = customers.id
);
```

- [ ] **Step 2: Kjør migrasjonen**

Run: `npm run migrate:single supabase/migrations/117_customer_contacts.sql` (evt. `bash scripts/migrate-single.sh supabase/migrations/117_customer_contacts.sql` hvis npm-scriptet ikke videresender argumentet — sjekk `package.json` sitt `migrate:single`-script).
Expected: `✨ Migration completed successfully!`. Hvis det feiler med en tilkoblingsfeil (IPv6/ETIMEDOUT), bytt `DATABASE_URL` i `.env.local` til pooler-tilkoblingen (`aws-1-eu-north-1.pooler.supabase.com`, bruker `postgres.<project-ref>`) og kjør på nytt.

- [ ] **Step 3: Verifiser backfill i Supabase SQL Editor**

Run: `SELECT c.name, cc.name, cc.is_primary FROM customers c JOIN customer_contacts cc ON cc.customer_id = c.id LIMIT 5;`
Expected: én rad per eksisterende kunde med `is_primary = true` og samme navn som `customers.name`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/117_customer_contacts.sql
git commit -m "feat: add customer_contacts table with backfill from customers"
```

---

### Task 2: Typer — `lib/types.ts`

**Files:**
- Modify: `lib/types.ts:647-648` (BoardScheduleItem), etter `Customer`-typen (linje 60)

**Interfaces:**
- Consumes: ingenting (rene typedeklarasjoner).
- Produces: `CustomerContact`, `SchedulePersonRef`, `ResolvedSchedulePerson`, oppdatert `BoardScheduleItem` — brukes av alle senere tasks.

- [ ] **Step 1: Legg til `CustomerContact`-typen rett etter `Customer`-typen (linje 60)**

```ts
export type CustomerContact = {
  id: string
  customer_id: string
  name: string
  email: string | null
  phone: string | null
  role: string | null
  is_primary: boolean
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Erstatt `BoardScheduleItem` (linje 647) med utvidet versjon + nye hjelpetyper**

```ts
export type SchedulePersonRef =
  | { type: 'customer_contact'; id: string }
  | { type: 'team_member'; id: string }

export type ResolvedSchedulePerson = {
  ref: SchedulePersonRef
  name: string
  role: string | null
  email: string | null
  phone: string | null
}

export type BoardScheduleItem = {
  id: string
  time: string
  label: string
  location?: string
  locationLink?: string
  people?: SchedulePersonRef[]
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: Ingen nye feil fra `lib/types.ts` (feil i andre filer som ennå ikke er oppdatert i denne planen forventes ikke ennå siden ingen andre filer bruker disse typene før Task 3+).

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add CustomerContact and schedule person reference types"
```

---

### Task 3: Server actions — `lib/actions/schedule-people.ts`

**Files:**
- Create: `lib/actions/schedule-people.ts`

**Interfaces:**
- Consumes: `CustomerContact`, `SchedulePersonRef`, `ResolvedSchedulePerson` fra `lib/types.ts` (Task 2); `createClient`, `createServiceClient` fra `lib/supabase-server.ts` (samme som `lib/actions/boards.ts` bruker).
- Produces: `searchCustomers`, `getCustomerContacts`, `createCustomerContact`, `updateCustomerContact`, `deleteCustomerContact`, `listTeamMembers`, `updateTeamMemberContact`, `resolveSchedulePeople`, samt typene `CustomerMatch` og `TeamMemberOption` — brukes av `PersonPicker`, `PersonChip`, `useResolvedPeople` (Task 5-7) og kundesiden (Task 9).

- [ ] **Step 1: Opprett filen**

```ts
'use server'

import { createClient, createServiceClient } from '@/lib/supabase-server'
import type { CustomerContact, ResolvedSchedulePerson, SchedulePersonRef } from '@/lib/types'

export type CustomerMatch = { id: string; name: string; company: string | null }
export type TeamMemberOption = { id: string; name: string; role: string; email: string | null; phone: string | null }

const now = () => new Date().toISOString()

export async function searchCustomers(query: string): Promise<CustomerMatch[]> {
  // Fjerner tegn som ville brutt PostgREST sin .or()-filterstreng-syntaks.
  const safe = query.trim().replace(/[,()%]/g, '')
  if (safe.length < 2) return []
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('customers')
      .select('id, name, company')
      .or(`name.ilike.%${safe}%,company.ilike.%${safe}%`)
      .order('name')
      .limit(20)
    return (data ?? []) as CustomerMatch[]
  } catch (err) {
    console.error('searchCustomers:', err)
    return []
  }
}

export async function getCustomerContacts(customerId: string): Promise<CustomerContact[]> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('customer_contacts')
      .select('*')
      .eq('customer_id', customerId)
      .order('is_primary', { ascending: false })
      .order('name')
    return (data ?? []) as CustomerContact[]
  } catch (err) {
    console.error('getCustomerContacts:', err)
    return []
  }
}

export async function createCustomerContact(input: {
  customer_id: string; name: string; email?: string | null; phone?: string | null; role?: string | null
}): Promise<CustomerContact | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.from('customer_contacts').insert({
      customer_id: input.customer_id,
      name: input.name.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      role: input.role?.trim() || null,
      is_primary: false,
    }).select('*').single()
    if (error) { console.error('createCustomerContact:', error); return null }
    return data as CustomerContact
  } catch (err) {
    console.error('createCustomerContact:', err)
    return null
  }
}

export async function updateCustomerContact(id: string, patch: {
  name?: string; email?: string | null; phone?: string | null; role?: string | null
}): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('customer_contacts')
      .update({ ...patch, updated_at: now() }).eq('id', id)
    return !error
  } catch (err) {
    console.error('updateCustomerContact:', err)
    return false
  }
}

export async function deleteCustomerContact(id: string): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('customer_contacts').delete().eq('id', id)
    return !error
  } catch (err) {
    console.error('deleteCustomerContact:', err)
    return false
  }
}

export async function listTeamMembers(): Promise<TeamMemberOption[]> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('team_members')
      .select('id, name, role, email, phone')
      .order('order_index')
    return (data ?? []) as TeamMemberOption[]
  } catch (err) {
    console.error('listTeamMembers:', err)
    return []
  }
}

export async function updateTeamMemberContact(id: string, patch: {
  email?: string | null; phone?: string | null
}): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('team_members')
      .update({ ...patch, updated_at: now() }).eq('id', id)
    return !error
  } catch (err) {
    console.error('updateTeamMemberContact:', err)
    return false
  }
}

/**
 * Slår opp visningsdata for en liste referanser. Bruker service-klienten når
 * kalleren er anonym (offentlig delt board, /b/[token]) siden RLS på
 * customer_contacts/team_members krever authenticated — samme mønster som
 * getSharedBoard bruker for å lese boards/board_cards anonymt.
 */
export async function resolveSchedulePeople(refs: SchedulePersonRef[]): Promise<ResolvedSchedulePerson[]> {
  if (refs.length === 0) return []
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const db = user ? supabase : createServiceClient()

    const contactIds = refs.filter(r => r.type === 'customer_contact').map(r => r.id)
    const teamIds = refs.filter(r => r.type === 'team_member').map(r => r.id)
    const resolved: ResolvedSchedulePerson[] = []

    if (contactIds.length > 0) {
      const { data } = await db.from('customer_contacts').select('id, name, role, email, phone').in('id', contactIds)
      for (const c of data ?? []) {
        resolved.push({ ref: { type: 'customer_contact', id: c.id }, name: c.name, role: c.role, email: c.email, phone: c.phone })
      }
    }
    if (teamIds.length > 0) {
      const { data } = await db.from('team_members').select('id, name, role, email, phone').in('id', teamIds)
      for (const t of data ?? []) {
        resolved.push({ ref: { type: 'team_member', id: t.id }, name: t.name, role: t.role, email: t.email, phone: t.phone })
      }
    }
    return resolved
  } catch (err) {
    console.error('resolveSchedulePeople:', err)
    return []
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: Ingen feil.

- [ ] **Step 3: Manuell smoke-test i Node/dev**

Start dev-serveren (`npm run dev`), åpne et prosjekts board (`/admin/projects/[id]` → Board-fane), åpne nettleser-devtools console, og i en midlertidig test-knapp eller via en eksisterende server action-testrute — enklest: fortsett til Task 4-8 hvor disse actions kalles fra faktisk UI, og verifiser der. (Denne filen har ingen egen side å teste isolert på, så verifikasjonen skjer i praksis via de UI-oppgavene som følger.)

- [ ] **Step 4: Commit**

```bash
git add lib/actions/schedule-people.ts
git commit -m "feat: add server actions for customer contacts and team member lookup"
```

---

### Task 4: Lokasjon-felt i `ScheduleNode.tsx`

**Files:**
- Modify: `components/boards/nodes/ScheduleNode.tsx`

**Interfaces:**
- Consumes: `BoardScheduleItem` (nå med `location`/`locationLink`) fra Task 2.
- Produces: `updateItem(itemId, patch)`-hjelpefunksjon som Task 8 gjenbruker for å legge til/fjerne folk.

- [ ] **Step 1: Legg til en `updateItem`-hjelper og en `mapsUrl`-hjelper rett under `sortByTime` (linje 12)**

```ts
const mapsUrl = (item: BoardScheduleItem): string | null => {
  if (item.locationLink) return item.locationLink
  if (item.location) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`
  return null
}
```

Inni komponenten, rett under `persist`-funksjonen (linje 32):

```ts
const updateItem = (itemId: string, patch: Partial<BoardScheduleItem>) => {
  persist(content.items.map(i => i.id === itemId ? { ...i, ...patch } : i))
}
```

- [ ] **Step 2: Erstatt item-raden i modalen (linje 124-147) med en to-linjers rad (tid/label + lokasjon/maps-lenke), og bruk `updateItem` i stedet for inline `.map()`**

```tsx
{items.map(item => {
  const link = mapsUrl(item)
  return (
    <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 8px', background: P.surface2, borderRadius: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="time"
          value={item.time}
          disabled={readOnly}
          onChange={e => updateItem(item.id, { time: e.target.value })}
          style={{ background: 'transparent', border: 'none', outline: 'none', color: P.text, fontSize: '0.8rem', fontWeight: 600, width: 84, flexShrink: 0 }}
        />
        <input
          value={item.label}
          readOnly={readOnly}
          onChange={e => updateItem(item.id, { label: e.target.value })}
          placeholder="Programpunkt"
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: P.text, fontSize: '0.8rem' }}
        />
        {!readOnly && (
          <button
            onClick={() => persist(content.items.filter(i => i.id !== item.id))}
            style={{ background: 'none', border: 'none', color: P.text2, cursor: 'pointer', fontSize: '0.75rem', flexShrink: 0 }}
          >✕</button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          value={item.location ?? ''}
          readOnly={readOnly}
          onChange={e => updateItem(item.id, { location: e.target.value || undefined })}
          placeholder="Lokasjon"
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: P.text2, fontSize: '0.72rem' }}
        />
        {!readOnly && (
          <input
            value={item.locationLink ?? ''}
            onChange={e => updateItem(item.id, { locationLink: e.target.value || undefined })}
            placeholder="Maps-lenke (valgfritt)"
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: P.text2, fontSize: '0.68rem' }}
          />
        )}
        {link && (
          <a
            href={link} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ color: P.accent, fontSize: '0.7rem', textDecoration: 'none', flexShrink: 0 }}
          >📍 Maps</a>
        )}
      </div>
    </div>
  )
})}
```

- [ ] **Step 3: Vis lokasjon i den sammenslåtte forhåndsvisningen (linje 73-77)**

```tsx
<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
  {item.label}{item.location ? ` · ${item.location}` : ''}
</span>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: Ingen feil.

- [ ] **Step 5: Manuell verifisering**

Kjør `npm run dev`, åpne et prosjekts board, dobbeltklikk et timeplan-kort (eller opprett ett), legg til et programpunkt, skriv "Kontoret, 3. etasje" i Lokasjon-feltet. Verifiser: (a) en "📍 Maps"-lenke dukker opp og åpner et Google Maps-søk på teksten i ny fane; (b) lim inn en ekte Google Maps-URL i Maps-lenke-feltet og verifiser at "📍 Maps" nå bruker den URL-en i stedet; (c) lukk og gjenåpne kortet (evt. reload siden) og verifiser at lokasjon/lenke er lagret.

- [ ] **Step 6: Commit**

```bash
git add components/boards/nodes/ScheduleNode.tsx
git commit -m "feat: add location and maps link fields to schedule items"
```

---

### Task 5: `useResolvedPeople`-hook

**Files:**
- Create: `components/boards/nodes/schedule/useResolvedPeople.ts`

**Interfaces:**
- Consumes: `resolveSchedulePeople` (Task 3), `SchedulePersonRef`/`ResolvedSchedulePerson` (Task 2).
- Produces: `useResolvedPeople(refs)` som returnerer `{ directory: Record<string, ResolvedSchedulePerson>, upsert: (p: ResolvedSchedulePerson) => void }`, samt en eksportert `refKey(ref)`-funksjon brukt av `ScheduleNode.tsx`, `PersonChip.tsx` og `PersonPicker.tsx` for konsistente oppslagsnøkler (`"customer_contact:<id>"` / `"team_member:<id>"`).

- [ ] **Step 1: Opprett hooken**

```ts
'use client'

import { useEffect, useState } from 'react'
import type { ResolvedSchedulePerson, SchedulePersonRef } from '@/lib/types'
import { resolveSchedulePeople } from '@/lib/actions/schedule-people'

export const refKey = (ref: SchedulePersonRef) => `${ref.type}:${ref.id}`

export function useResolvedPeople(allRefs: SchedulePersonRef[]) {
  const [directory, setDirectory] = useState<Record<string, ResolvedSchedulePerson>>({})
  const missingKey = allRefs.filter(r => !directory[refKey(r)]).map(refKey).join(',')

  useEffect(() => {
    if (!missingKey) return
    const missing = allRefs.filter(r => !directory[refKey(r)])
    if (missing.length === 0) return
    let cancelled = false
    resolveSchedulePeople(missing).then(people => {
      if (cancelled) return
      setDirectory(prev => {
        const next = { ...prev }
        for (const p of people) next[refKey(p.ref)] = p
        return next
      })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey])

  const upsert = (person: ResolvedSchedulePerson) => {
    setDirectory(prev => ({ ...prev, [refKey(person.ref)]: person }))
  }

  return { directory, upsert }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: Ingen feil.

- [ ] **Step 3: Commit**

```bash
git add components/boards/nodes/schedule/useResolvedPeople.ts
git commit -m "feat: add useResolvedPeople hook for schedule person lookups"
```

---

### Task 6: `PersonChip`-komponent

**Files:**
- Create: `components/boards/nodes/schedule/PersonChip.tsx`

**Interfaces:**
- Consumes: `ResolvedSchedulePerson` (Task 2), `updateCustomerContact`/`updateTeamMemberContact` (Task 3), `useBoardUi` fra `../../boardContext`.
- Produces: `<PersonChip person readOnly onRemove onUpdated />` — brukt av `ScheduleNode.tsx` (Task 8).

- [ ] **Step 1: Opprett komponenten**

```tsx
'use client'

import { useState } from 'react'
import type { ResolvedSchedulePerson } from '@/lib/types'
import { updateCustomerContact, updateTeamMemberContact } from '@/lib/actions/schedule-people'
import { useBoardUi } from '../../boardContext'

type Props = {
  person: ResolvedSchedulePerson | undefined
  readOnly: boolean
  onRemove: () => void
  onUpdated: (person: ResolvedSchedulePerson) => void
}

export default function PersonChip({ person, readOnly, onRemove, onUpdated }: Props) {
  const { palette: P } = useBoardUi()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ email: person?.email ?? '', phone: person?.phone ?? '' })

  if (!person) return null

  const save = async () => {
    const patch = { email: draft.email || null, phone: draft.phone || null }
    const ok = person.ref.type === 'customer_contact'
      ? await updateCustomerContact(person.ref.id, patch)
      : await updateTeamMemberContact(person.ref.id, patch)
    if (ok) onUpdated({ ...person, ...patch })
    setOpen(false)
  }

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <span
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
          background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 999,
          fontSize: '0.68rem', color: P.text, cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        {person.name}
        {person.role && <span style={{ color: P.text2 }}>· {person.role}</span>}
        {!readOnly && (
          <span onClick={e => { e.stopPropagation(); onRemove() }} style={{ color: P.text2, marginLeft: 2 }}>✕</span>
        )}
      </span>

      {open && (
        <div
          className="nodrag"
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 20,
            width: 220, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 8,
            padding: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: P.text, marginBottom: 6 }}>{person.name}</div>
          <label style={{ fontSize: '0.62rem', color: P.text2 }}>E-post</label>
          <input
            value={draft.email}
            disabled={readOnly}
            onChange={e => setDraft(d => ({ ...d, email: e.target.value }))}
            placeholder="Ikke satt"
            style={{ width: '100%', background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 4, padding: '4px 6px', color: P.text, fontSize: '0.72rem', marginBottom: 6, outline: 'none' }}
          />
          <label style={{ fontSize: '0.62rem', color: P.text2 }}>Telefon</label>
          <input
            value={draft.phone}
            disabled={readOnly}
            onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))}
            placeholder="Ikke satt"
            style={{ width: '100%', background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 4, padding: '4px 6px', color: P.text, fontSize: '0.72rem', outline: 'none' }}
          />
          {!readOnly && (
            <button
              onClick={save}
              style={{ marginTop: 8, width: '100%', padding: '5px 0', background: P.accent, color: P.canvasBg, border: 'none', borderRadius: 4, fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer' }}
            >Lagre</button>
          )}
        </div>
      )}
    </span>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: Feil om `ScheduleNode.tsx` ikke importerer/bruker komponenten ennå er OK (ubrukt fil feiler ikke typecheck) — ingen feil forventet fra selve filen.

- [ ] **Step 3: Commit**

```bash
git add components/boards/nodes/schedule/PersonChip.tsx
git commit -m "feat: add PersonChip component with inline contact info editing"
```

---

### Task 7: `PersonPicker`-komponent

**Files:**
- Create: `components/boards/nodes/schedule/PersonPicker.tsx`

**Interfaces:**
- Consumes: `searchCustomers`, `getCustomerContacts`, `createCustomerContact`, `listTeamMembers`, `CustomerMatch`, `TeamMemberOption` (Task 3); `CustomerContact`, `ResolvedSchedulePerson`, `SchedulePersonRef` (Task 2); `useBoardUi`.
- Produces: `<PersonPicker onSelect={(ref, resolved) => void} onClose={() => void} />` — brukt av `ScheduleNode.tsx` (Task 8).

- [ ] **Step 1: Opprett komponenten**

```tsx
'use client'

import { useEffect, useState } from 'react'
import type { CustomerContact, ResolvedSchedulePerson, SchedulePersonRef } from '@/lib/types'
import {
  searchCustomers, getCustomerContacts, createCustomerContact, listTeamMembers,
  type CustomerMatch, type TeamMemberOption,
} from '@/lib/actions/schedule-people'
import { useBoardUi } from '../../boardContext'

type Props = {
  onSelect: (ref: SchedulePersonRef, resolved: ResolvedSchedulePerson) => void
  onClose: () => void
}

export default function PersonPicker({ onSelect, onClose }: Props) {
  const { palette: P } = useBoardUi()
  const [tab, setTab] = useState<'customer' | 'team'>('customer')

  const [query, setQuery] = useState('')
  const [customerMatches, setCustomerMatches] = useState<CustomerMatch[]>([])
  const [activeCustomer, setActiveCustomer] = useState<CustomerMatch | null>(null)
  const [contacts, setContacts] = useState<CustomerContact[]>([])
  const [showNewForm, setShowNewForm] = useState(false)
  const [newContact, setNewContact] = useState({ name: '', role: '', email: '', phone: '' })

  const [team, setTeam] = useState<TeamMemberOption[]>([])
  const [teamQuery, setTeamQuery] = useState('')

  useEffect(() => {
    if (tab !== 'team' || team.length > 0) return
    listTeamMembers().then(setTeam)
  }, [tab, team.length])

  useEffect(() => {
    if (activeCustomer) return
    const handle = setTimeout(() => {
      if (query.trim().length < 2) { setCustomerMatches([]); return }
      searchCustomers(query).then(setCustomerMatches)
    }, 250)
    return () => clearTimeout(handle)
  }, [query, activeCustomer])

  useEffect(() => {
    if (!activeCustomer) { setContacts([]); return }
    getCustomerContacts(activeCustomer.id).then(setContacts)
  }, [activeCustomer])

  const pickContact = (c: CustomerContact) => {
    onSelect(
      { type: 'customer_contact', id: c.id },
      { ref: { type: 'customer_contact', id: c.id }, name: c.name, role: c.role, email: c.email, phone: c.phone },
    )
  }

  const pickTeamMember = (t: TeamMemberOption) => {
    onSelect(
      { type: 'team_member', id: t.id },
      { ref: { type: 'team_member', id: t.id }, name: t.name, role: t.role, email: t.email, phone: t.phone },
    )
  }

  const submitNewContact = async () => {
    if (!activeCustomer || !newContact.name.trim()) return
    const created = await createCustomerContact({
      customer_id: activeCustomer.id,
      name: newContact.name,
      email: newContact.email || null,
      phone: newContact.phone || null,
      role: newContact.role || null,
    })
    if (created) pickContact(created)
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '6px 0', textAlign: 'center', fontSize: '0.68rem', letterSpacing: '0.05em',
    textTransform: 'uppercase', cursor: 'pointer', color: active ? P.text : P.text2,
    borderBottom: `2px solid ${active ? P.accent : 'transparent'}`,
  })

  return (
    <div
      className="nodrag"
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 30,
        width: 260, maxHeight: 320, overflowY: 'auto', background: P.surface,
        border: `1px solid ${P.border}`, borderRadius: 8, padding: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          <div style={tabStyle(tab === 'customer')} onClick={() => setTab('customer')}>Kunde</div>
          <div style={tabStyle(tab === 'team')} onClick={() => setTab('team')}>Team</div>
        </div>
        <span onClick={onClose} style={{ cursor: 'pointer', color: P.text2, fontSize: '0.75rem', marginLeft: 8 }}>✕</span>
      </div>

      {tab === 'customer' && (
        !activeCustomer ? (
          <>
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Søk etter kunde..."
              style={{ width: '100%', background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 4, padding: '5px 8px', color: P.text, fontSize: '0.74rem', outline: 'none', marginBottom: 6 }}
            />
            {customerMatches.map(c => (
              <div key={c.id} onClick={() => setActiveCustomer(c)} style={{ padding: '5px 6px', fontSize: '0.72rem', color: P.text, cursor: 'pointer', borderRadius: 4 }}>
                {c.name}{c.company ? ` · ${c.company}` : ''}
              </div>
            ))}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: P.text }}>{activeCustomer.name}</span>
              <span onClick={() => setActiveCustomer(null)} style={{ fontSize: '0.65rem', color: P.text2, cursor: 'pointer' }}>Bytt</span>
            </div>
            {contacts.map(c => (
              <div key={c.id} onClick={() => pickContact(c)} style={{ padding: '5px 6px', fontSize: '0.72rem', color: P.text, cursor: 'pointer', borderRadius: 4 }}>
                {c.name}{c.role ? ` · ${c.role}` : ''}
              </div>
            ))}
            {!showNewForm ? (
              <div onClick={() => setShowNewForm(true)} style={{ marginTop: 6, fontSize: '0.68rem', color: P.accent, cursor: 'pointer' }}>+ Ny kontaktperson</div>
            ) : (
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <input autoFocus value={newContact.name} onChange={e => setNewContact(n => ({ ...n, name: e.target.value }))} placeholder="Navn *" style={{ background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 4, padding: '4px 6px', color: P.text, fontSize: '0.7rem', outline: 'none' }} />
                <input value={newContact.role} onChange={e => setNewContact(n => ({ ...n, role: e.target.value }))} placeholder="Rolle (f.eks. Markedssjef)" style={{ background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 4, padding: '4px 6px', color: P.text, fontSize: '0.7rem', outline: 'none' }} />
                <input value={newContact.email} onChange={e => setNewContact(n => ({ ...n, email: e.target.value }))} placeholder="E-post" style={{ background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 4, padding: '4px 6px', color: P.text, fontSize: '0.7rem', outline: 'none' }} />
                <input value={newContact.phone} onChange={e => setNewContact(n => ({ ...n, phone: e.target.value }))} placeholder="Telefon" style={{ background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 4, padding: '4px 6px', color: P.text, fontSize: '0.7rem', outline: 'none' }} />
                <button onClick={submitNewContact} disabled={!newContact.name.trim()} style={{ padding: '5px 0', background: P.accent, color: P.canvasBg, border: 'none', borderRadius: 4, fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer' }}>Legg til og velg</button>
              </div>
            )}
          </>
        )
      )}

      {tab === 'team' && (
        <>
          <input
            autoFocus
            value={teamQuery}
            onChange={e => setTeamQuery(e.target.value)}
            placeholder="Søk i teamet..."
            style={{ width: '100%', background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 4, padding: '5px 8px', color: P.text, fontSize: '0.74rem', outline: 'none', marginBottom: 6 }}
          />
          {team.filter(t => t.name.toLowerCase().includes(teamQuery.toLowerCase())).map(t => (
            <div key={t.id} onClick={() => pickTeamMember(t)} style={{ padding: '5px 6px', fontSize: '0.72rem', color: P.text, cursor: 'pointer', borderRadius: 4 }}>
              {t.name} · {t.role}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: Ingen feil.

- [ ] **Step 3: Commit**

```bash
git add components/boards/nodes/schedule/PersonPicker.tsx
git commit -m "feat: add PersonPicker component for customer contacts and team members"
```

---

### Task 8: Koble `PersonPicker`/`PersonChip` inn i `ScheduleNode.tsx`

**Files:**
- Modify: `components/boards/nodes/ScheduleNode.tsx`

**Interfaces:**
- Consumes: `useResolvedPeople`, `refKey` (Task 5), `PersonChip` (Task 6), `PersonPicker` (Task 7), `updateItem` (Task 4).

- [ ] **Step 1: Importer de nye modulene og typene øverst i filen**

```ts
import type { BoardScheduleContent, BoardScheduleItem, ResolvedSchedulePerson, SchedulePersonRef } from '@/lib/types'
import { useResolvedPeople, refKey } from './schedule/useResolvedPeople'
import PersonChip from './schedule/PersonChip'
import PersonPicker from './schedule/PersonPicker'
```

- [ ] **Step 2: Legg til state og resolved-people-hook inni komponenten (rett under `newLabel`-state, linje 24)**

```ts
const [openPickerFor, setOpenPickerFor] = useState<string | null>(null)
const allPeopleRefs = items.flatMap(i => i.people ?? [])
const { directory, upsert } = useResolvedPeople(allPeopleRefs)

const addPersonToItem = (itemId: string, ref: SchedulePersonRef, resolved: ResolvedSchedulePerson) => {
  const item = content.items.find(i => i.id === itemId)
  if (!item) return
  updateItem(itemId, { people: [...(item.people ?? []), ref] })
  upsert(resolved)
  setOpenPickerFor(null)
}

const removePersonFromItem = (itemId: string, ref: SchedulePersonRef) => {
  const item = content.items.find(i => i.id === itemId)
  if (!item) return
  updateItem(itemId, { people: (item.people ?? []).filter(p => !(p.type === ref.type && p.id === ref.id)) })
}
```

- [ ] **Step 3: Legg til en folk-rad rett under lokasjon-raden i item-blokken fra Task 4**

```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', position: 'relative' }}>
  {(item.people ?? []).map(ref => (
    <PersonChip
      key={refKey(ref)}
      person={directory[refKey(ref)]}
      readOnly={!!readOnly}
      onRemove={() => removePersonFromItem(item.id, ref)}
      onUpdated={upsert}
    />
  ))}
  {!readOnly && (
    <span
      onClick={() => setOpenPickerFor(openPickerFor === item.id ? null : item.id)}
      style={{ fontSize: '0.68rem', color: P.accent, cursor: 'pointer' }}
    >+ person</span>
  )}
  {openPickerFor === item.id && (
    <PersonPicker
      onSelect={(ref, resolved) => addPersonToItem(item.id, ref, resolved)}
      onClose={() => setOpenPickerFor(null)}
    />
  )}
</div>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: Ingen feil.

- [ ] **Step 5: Manuell verifisering — full flyt**

Kjør `npm run dev`, åpne et prosjekts board, åpne et timeplan-kort. For ett programpunkt:
1. Klikk "+ person" → fane "Kunde" → søk på en eksisterende kundes navn → velg kunden → velg en kontaktperson (eller "+ Ny kontaktperson" hvis ingen finnes, fyll inn navn og lagre).
2. Verifiser at en chip med navnet dukker opp på programpunktet umiddelbart (uten reload).
3. Klikk chippen → verifiser at en popover med e-post/telefon åpnes; endre telefonnummeret og lagre.
4. Reload siden, åpne kortet igjen, klikk samme chip → verifiser at det oppdaterte telefonnummeret vises (bekrefter at det er en levende referanse, ikke et øyeblikksbilde).
5. Gå til `/admin/customers/[samme kunde]/edit` → verifiser at kontaktpersonen og det oppdaterte telefonnummeret vises der også (fullført i Task 9 — hopp over dette punktet før Task 9 er gjort).
6. Klikk "+ person" → fane "Team" → søk/velg et team-medlem → verifiser at chippen dukker opp.
7. Klikk ✕ på en chip → verifiser at personen fjernes fra programpunktet.

- [ ] **Step 6: Commit**

```bash
git add components/boards/nodes/ScheduleNode.tsx
git commit -m "feat: wire person picker and contact chips into schedule items"
```

---

### Task 9: "Kontaktpersoner"-seksjon på kundesiden

**Files:**
- Modify: `app/admin/customers/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `getCustomerContacts`, `createCustomerContact`, `updateCustomerContact`, `deleteCustomerContact` (Task 3), `CustomerContact` (Task 2).

- [ ] **Step 1: Utvid eksisterende import og legg til state (rett under eksisterende `useState`-deklarasjoner, etter linje 57)**

Endre den eksisterende importen på linje 7 fra:
```ts
import { Customer } from '@/lib/types'
```
til:
```ts
import { Customer, CustomerContact } from '@/lib/types'
```

Legg til en ny import rett under (linje 8):
```ts
import { getCustomerContacts, createCustomerContact, updateCustomerContact, deleteCustomerContact } from '@/lib/actions/schedule-people'
```

```ts
const [contacts, setContacts] = useState<CustomerContact[]>([])
const [contactsLoading, setContactsLoading] = useState(true)
const [newContact, setNewContact] = useState({ name: '', role: '', email: '', phone: '' })
const [editingContactId, setEditingContactId] = useState<string | null>(null)
const [editDraft, setEditDraft] = useState({ name: '', role: '', email: '', phone: '' })

useEffect(() => {
  if (!customerId) return
  getCustomerContacts(customerId).then(data => { setContacts(data); setContactsLoading(false) })
}, [customerId])

async function handleAddContact() {
  if (!newContact.name.trim()) return
  const created = await createCustomerContact({
    customer_id: customerId,
    name: newContact.name,
    role: newContact.role || null,
    email: newContact.email || null,
    phone: newContact.phone || null,
  })
  if (created) {
    setContacts(prev => [...prev, created])
    setNewContact({ name: '', role: '', email: '', phone: '' })
  }
}

function startEditContact(c: CustomerContact) {
  setEditingContactId(c.id)
  setEditDraft({ name: c.name, role: c.role ?? '', email: c.email ?? '', phone: c.phone ?? '' })
}

async function saveEditContact(id: string) {
  const patch = { name: editDraft.name, role: editDraft.role || null, email: editDraft.email || null, phone: editDraft.phone || null }
  const ok = await updateCustomerContact(id, patch)
  if (ok) {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
    setEditingContactId(null)
  }
}

async function handleDeleteContact(id: string) {
  if (!confirm('Slette denne kontaktpersonen?')) return
  const ok = await deleteCustomerContact(id)
  if (ok) setContacts(prev => prev.filter(c => c.id !== id))
}
```

- [ ] **Step 2: Legg til seksjonen i JSX, rett etter "Notater"-blokken (etter linje 337, før `<div className="flex gap-3 pt-4">`)**

```tsx
<div>
  {fieldLabel('Kontaktpersoner')}
  {contactsLoading ? (
    <p style={{ fontSize: '0.7rem', color: C.text3 }}>Laster...</p>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {contacts.map(c => (
        <div key={c.id} style={{ padding: 10, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 3 }}>
          {editingContactId === c.id ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input value={editDraft.name} onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))} placeholder="Navn" style={inputStyle} />
              <input value={editDraft.role} onChange={e => setEditDraft(d => ({ ...d, role: e.target.value }))} placeholder="Rolle" style={inputStyle} />
              <input value={editDraft.email} onChange={e => setEditDraft(d => ({ ...d, email: e.target.value }))} placeholder="E-post" style={inputStyle} />
              <input value={editDraft.phone} onChange={e => setEditDraft(d => ({ ...d, phone: e.target.value }))} placeholder="Telefon" style={inputStyle} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => saveEditContact(c.id)} style={{ fontSize: '0.65rem', color: C.accent, background: 'none', border: 'none', cursor: 'pointer' }}>Lagre</button>
                <button type="button" onClick={() => setEditingContactId(null)} style={{ fontSize: '0.65rem', color: C.text3, background: 'none', border: 'none', cursor: 'pointer' }}>Avbryt</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: C.text, fontWeight: 600 }}>
                  {c.name}{c.role ? ` · ${c.role}` : ''}{c.is_primary ? ' · Primær' : ''}
                </div>
                <div style={{ fontSize: '0.68rem', color: C.text3 }}>
                  {c.email || 'Ingen e-post'} · {c.phone || 'Ingen telefon'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => startEditContact(c)} style={{ fontSize: '0.65rem', color: C.accent, background: 'none', border: 'none', cursor: 'pointer' }}>Rediger</button>
                <button type="button" onClick={() => handleDeleteContact(c.id)} style={{ fontSize: '0.65rem', color: C.text3, background: 'none', border: 'none', cursor: 'pointer' }}>Slett</button>
              </div>
            </div>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, border: `1px dashed ${C.border}`, borderRadius: 3 }}>
        <input value={newContact.name} onChange={e => setNewContact(n => ({ ...n, name: e.target.value }))} placeholder="Navn *" style={inputStyle} />
        <input value={newContact.role} onChange={e => setNewContact(n => ({ ...n, role: e.target.value }))} placeholder="Rolle" style={inputStyle} />
        <input value={newContact.email} onChange={e => setNewContact(n => ({ ...n, email: e.target.value }))} placeholder="E-post" style={inputStyle} />
        <input value={newContact.phone} onChange={e => setNewContact(n => ({ ...n, phone: e.target.value }))} placeholder="Telefon" style={inputStyle} />
        <button type="button" onClick={handleAddContact} disabled={!newContact.name.trim()} style={{ alignSelf: 'flex-start', fontSize: '0.65rem', color: C.accent, background: 'none', border: 'none', cursor: 'pointer' }}>+ Legg til kontaktperson</button>
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: Ingen feil.

- [ ] **Step 4: Manuell verifisering**

Åpne `/admin/customers/[id]/edit` for en kunde som allerede har fått en backfillet primærkontakt (Task 1). Verifiser: (a) primærkontakten vises i listen med "· Primær"; (b) legg til en ny kontaktperson med navn+rolle+e-post+telefon, verifiser at den dukker opp i listen uten reload; (c) klikk "Rediger" på en kontakt, endre telefonnummeret, lagre, verifiser at endringen vises; (d) klikk "Slett" på testkontakten du la til, bekreft, verifiser at den forsvinner.

- [ ] **Step 5: Commit**

```bash
git add app/admin/customers/[id]/edit/page.tsx
git commit -m "feat: add contact person management to customer edit page"
```

---

### Task 10: Full regresjonssjekk

**Files:** Ingen nye — kun verifisering på tvers av alt som er endret.

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Bygget fullfører uten TypeScript- eller lint-feil.

- [ ] **Step 2: End-to-end manuell sjekk**

Med `npm run dev`: opprett et helt nytt timeplan-kort på et board, legg til to programpunkter med ulik tid, lokasjon, Maps-lenke og en blanding av kunde-kontakt(er) og team-medlem(mer) på hvert. Reload siden og bekreft at alt (tid, label, lokasjon, lenke, folk-chips med riktig navn/rolle) er persistert korrekt. Åpne boardet i en annen nettleserfane samtidig og bekreft at endringer dukker opp i sanntid (samme realtime-mønster som resten av boardet allerede bruker).

- [ ] **Step 3: Sjekk offentlig delt board (om det finnes en delt lenke å teste med)**

Aktiver deling på et testboard (`enableBoardShare`), åpne `/b/[token]`-lenken i en inkognitovindu (uinnlogget), og bekreft at timeplan-kortet viser lokasjon og folk-chips med riktig navn (bekrefter at `resolveSchedulePeople` sin service-klient-fallback for anonyme brukere fungerer).

- [ ] **Step 4: Commit (kun hvis regresjonssjekken avdekket rettelser)**

```bash
git add -A
git commit -m "fix: address issues found in schedule location/people regression check"
```
