# Quote Builder Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Forbedre tilbuds-workflowen med auto-populate fra prosjektdata, halvdagsstøtte, auto-utstyrsmengde, kategorisert utstyrspicker og tilbudschat med @mentions.

**Architecture:** Alle endringer er additive til eksisterende QuoteBuilder-arkitektur. Database-migrasjonen (task 1) er en forutsetning for chat-featuren (task 5). Tasks 2–4 er uavhengige av hverandre og kan gjøres i hvilken rekkefølge som helst etter task 1.

**Tech Stack:** Next.js 16 App Router, Supabase (PostgreSQL + RLS), TypeScript strict, `@supabase/ssr`, eksisterende `createClient`/`createServiceClient` pattern.

## Global Constraints

- Aldri bruk `profiles!project_lead_id`-join — den feiler på RLS. Hent profiles separat.
- Server actions bruker `createClient()` for bruker-autentiserte operasjoner, `createServiceClient()` kun for notification-inserts (service-level bypass).
- Alle nye tabeller trenger RLS policies.
- Neste migrasjons-prefix er `080_`.
- Notifications-pattern: bruk `lib/notify-assignment.ts`-mønsteret — feil logges og svelges, varsling blokkerer aldri hovedhandlingen.
- Eksisterende `notifications_type_check`-constraint må drop+recreate ved utvidelse.
- Design-system: `C`-farger fra `lib/admin-theme.ts`, font `var(--font-dm-sans)`.

---

## File Map

| Fil | Status | Ansvar |
|---|---|---|
| `supabase/migrations/080_quote_messages.sql` | Ny | quote_messages-tabell + RLS + utvidet notifications constraint |
| `lib/types.ts` | Endre | `QuoteMessage`-type, `quote_mention` i `Notification.type` |
| `lib/actions/notifications.ts` | Endre | `quote_mention` i type union |
| `lib/notify-assignment.ts` | Endre | Utvid `type`-parameter med `quote_mention` |
| `lib/actions/quotes.ts` | Ny | `getQuoteMessages`, `sendQuoteMessage` server actions |
| `components/quote/QuoteBuilder.tsx` | Endre | Halvdager, auto-utstyrsmengde, kategorisert picker, manglende-felt-banner |
| `app/admin/projects/[id]/quote/page.tsx` | Endre | Auto-populate (shoot_end, profiles, project_type, language), chat-panel |
| `components/quote/QuoteChat.tsx` | Ny | Chat UI med @mention-autocomplete |

---

## Task 1: Database — quote_messages + constraint

**Files:**
- Create: `supabase/migrations/080_quote_messages.sql`
- Modify: `lib/types.ts` (legg til `QuoteMessage`, utvid `Notification.type`)
- Modify: `lib/actions/notifications.ts` (utvid type union)
- Modify: `lib/notify-assignment.ts` (utvid type union)

**Interfaces:**
- Produces:
  - `QuoteMessage` type i `lib/types.ts`
  - `quote_messages`-tabell i Supabase
  - `'quote_mention'` som gyldig notifications-type

- [ ] **Steg 1: Skriv migrasjonen**

Opprett `/Users/magnusnordmo/Prosjektbeskrivelse_leafilms/leafilms-pitch/supabase/migrations/080_quote_messages.sql`:

```sql
-- 080_quote_messages.sql
-- Tilbudschat: meldinger knyttet til et tilbud med @mention-varsler

CREATE TABLE IF NOT EXISTS quote_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id    UUID        NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id),
  message     TEXT        NOT NULL CHECK (char_length(message) > 0),
  mentions    UUID[]      NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_messages_quote ON quote_messages(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_messages_project ON quote_messages(project_id);

ALTER TABLE quote_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authed_read_quote_messages"
  ON quote_messages FOR SELECT TO authenticated USING (true);

CREATE POLICY "authed_insert_quote_messages"
  ON quote_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Utvid notifications type-constraint med quote_mention
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned', 'quote_assigned', 'invoice_assigned',
    'quote_mention'
  ));
```

- [ ] **Steg 2: Kjør migrasjonen**

```bash
cd /Users/magnusnordmo/Prosjektbeskrivelse_leafilms/leafilms-pitch
npx supabase db push
```

Forventet output: migrasjonen kjøres uten feil. Sjekk at `quote_messages`-tabellen finnes i Supabase Dashboard.

- [ ] **Steg 3: Legg til `QuoteMessage` i `lib/types.ts`**

Finn slutten av `Quote`-typen (rundt linje 80) og legg til rett etter:

```typescript
export type QuoteMessage = {
  id: string
  quote_id: string
  project_id: string
  user_id: string
  message: string
  mentions: string[]
  created_at: string
  user: { id: string; name: string | null; email: string } | null
}
```

Finn `Notification`-typens `type`-union i `lib/actions/notifications.ts` (linje ~8):

```typescript
// Før:
type: 'project_message' | 'task_message' | 'selection_submitted' | 'task_assigned' | 'lead_assigned' | 'quote_assigned' | 'invoice_assigned'

// Etter:
type: 'project_message' | 'task_message' | 'selection_submitted' | 'task_assigned' | 'lead_assigned' | 'quote_assigned' | 'invoice_assigned' | 'quote_mention'
```

- [ ] **Steg 4: Utvid `notifyAssignment` i `lib/notify-assignment.ts`**

Endre `type`-parameteret i `opts`:

```typescript
// Før:
type: 'task_assigned' | 'lead_assigned' | 'quote_assigned' | 'invoice_assigned'

// Etter:
type: 'task_assigned' | 'lead_assigned' | 'quote_assigned' | 'invoice_assigned' | 'quote_mention'
```

- [ ] **Steg 5: Verifiser TypeScript**

```bash
cd /Users/magnusnordmo/Prosjektbeskrivelse_leafilms/leafilms-pitch
npx tsc --noEmit 2>&1 | head -20
```

Forventet: ingen feil.

- [ ] **Steg 6: Commit**

```bash
git add supabase/migrations/080_quote_messages.sql lib/types.ts lib/actions/notifications.ts lib/notify-assignment.ts
git commit -m "feat: add quote_messages table and quote_mention notification type"
```

---

## Task 2: QuoteBuilder — halvdager + auto-utstyrsmengde

**Files:**
- Modify: `components/quote/QuoteBuilder.tsx`

**Interfaces:**
- Consumes: `QuoteBuilderData.shootDays: number`, `QuoteBuilderData.equipment: QuoteBuilderItem[]`
- Produces: `ShootCrewSection` med halvdag-knapper, `handleShootDaysChange` oppdaterer også equipment quantities

- [ ] **Steg 1: Oppdater `handleShootDaysChange` (~linje 799)**

```typescript
const handleShootDaysChange = useCallback((days: number) => {
  const factor = discountFactors.find(f => f.shoot_day === Math.round(days))
  setData(prev => ({
    ...prev,
    shootDays: days,
    discountFactor: factor !== undefined ? Number(factor.discount_factor) : prev.discountFactor ?? 0,
    equipment: prev.equipment.map(e => ({ ...e, quantity: days })),
  }))
}, [discountFactors])
```

- [ ] **Steg 2: Oppdater dag-knappene i `ShootCrewSection` (~linje 644)**

Erstatt `{[1, 2, 3, 4, 5, 6, 7].map(d => (` med ny sekvens som støtter halvdager:

```typescript
{([0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7] as number[]).map(d => {
  const label = d === 0.5 ? '½' : d === 1.5 ? '1½' : d === 2.5 ? '2½' : String(d)
  return (
    <button
      key={d}
      type="button"
      onClick={() => applyShootDays(d)}
      style={{
        width: d % 1 === 0 ? 28 : 36,
        height: 28,
        fontSize: '0.72rem',
        borderRadius: 3,
        cursor: 'pointer',
        fontFamily: 'var(--font-dm-sans)',
        transition: 'background 0.1s, color 0.1s',
        background: shootDays === d ? C.accent : C.surface2,
        color: shootDays === d ? '#fff' : C.text2,
        border: `1px solid ${shootDays === d ? C.accent : C.border}`,
        fontWeight: shootDays === d ? 600 : 400,
      }}
    >
      {label}
    </button>
  )
})}
```

Fjern `</button>` og `{d}` og closing paren fra den gamle loopen — hele blokken fra `{[1,2,...` til `</button>` erstattes.

- [ ] **Steg 3: Auto-mengde ved katalog-valg fra utstyrsseksjonen**

`ItemSection.addFromCatalog` hardkoder `quantity: 1`. Utstyrsseksjonen bør bruke `shootDays` som default. Legg til valgfri prop `defaultQuantity` på `ItemSection`:

```typescript
function ItemSection({
  label, items, catalog, catalogCategories, onChange, addLabel = '+ Legg til', defaultQuantity = 1,
}: {
  label: string
  items: QuoteBuilderItem[]
  catalog: PriceCatalogItem[]
  catalogCategories?: string[]
  onChange: (items: QuoteBuilderItem[]) => void
  addLabel?: string
  defaultQuantity?: number
}) {
  const update = (id: string, field: keyof QuoteBuilderItem, value: string | number) =>
    onChange(items.map(i => (i.id === id ? { ...i, [field]: value } : i)))
  const add = () => onChange([...items, { id: newId(), description: '', quantity: defaultQuantity, unitPrice: 0 }])
  const addFromCatalog = (item: PriceCatalogItem) =>
    onChange([...items, { id: newId(), description: item.name, quantity: defaultQuantity, unitPrice: item.default_price }])
  // resten uendret
```

Oppdater kallet på `ItemSection` for utstyrslisten (~linje 917) i `QuoteBuilder`:

```typescript
<ItemSection
  label="Utstyrsliste"
  items={data.equipment}
  catalog={priceCatalog}
  catalogCategories={['kamera', 'lys', 'lyd', 'utstyr']}
  onChange={v => set('equipment', v)}
  addLabel="+ Legg til utstyr"
  defaultQuantity={data.shootDays}
/>
```

- [ ] **Steg 4: Manuell test**

Start dev-server (`npm run dev`), gå til `/admin/projects/[et prosjekt]/quote`:
1. Velg `1½` dager → sjekk at crew-dager og eksisterende utstyrsmengder settes til 1.5
2. Legg til utstyr fra katalog → mengde skal være 1.5
3. Velg `3` dager → sjekk at utstyrsmengder oppdateres til 3

- [ ] **Steg 5: Commit**

```bash
git add components/quote/QuoteBuilder.tsx
git commit -m "feat: half-day support and auto equipment quantity from shoot days"
```

---

## Task 3: QuoteBuilder — kategorisert utstyrspicker

**Files:**
- Modify: `components/quote/QuoteBuilder.tsx` (kun `CatalogPicker`-funksjonen, ~linje 106–195)

**Interfaces:**
- Consumes: `filterCategories?: string[]` prop (uendret), `PriceCatalogItem.category: string`
- Produces: gruppert visning med kategori-overskrifter når `filterCategories.length >= 2`

- [ ] **Steg 1: Oppdater `CatalogPicker`**

Erstatt hele `CatalogPicker`-funksjonen (~linje 106–195):

```typescript
const CATEGORY_LABELS: Record<string, string> = {
  kamera: 'Kamera',
  lys: 'Lys',
  lyd: 'Lyd',
  utstyr: 'Utstyr',
  post: 'Post',
  transport: 'Transport',
  annet: 'Annet',
}

function CatalogPicker({
  catalog,
  onSelect,
  filterCategories,
}: {
  catalog: PriceCatalogItem[]
  onSelect: (item: PriceCatalogItem) => void
  filterCategories?: string[]
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = catalog
    .filter(i => !filterCategories || filterCategories.includes(i.category))
    .filter(i => i.name.toLowerCase().includes(search.toLowerCase()))

  const useGrouped = (filterCategories?.length ?? 0) >= 2

  const grouped: { cat: string; items: PriceCatalogItem[] }[] = useGrouped
    ? (filterCategories ?? [])
        .map(cat => ({ cat, items: filtered.filter(i => i.category === cat) }))
        .filter(g => g.items.length > 0)
    : []

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(o => !o)}>
        Fra katalog {open ? '▲' : '▼'}
      </Button>
      {open && (
        <div style={{
          position: 'absolute',
          zIndex: 50,
          top: '100%',
          left: 0,
          marginTop: 4,
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 3,
          minWidth: 280,
          maxHeight: 320,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {catalog.length > 0 && (
            <div style={{ padding: 8, flexShrink: 0 }}>
              <input
                autoFocus
                style={{ ...fieldStyle, background: C.bg, padding: '6px 12px', fontSize: '0.78rem' }}
                placeholder="Søk..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          )}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {catalog.length === 0 ? (
              <p style={{ padding: '12px 16px', fontSize: '0.72rem', color: C.text3, fontFamily: 'var(--font-dm-sans)' }}>
                Ingen elementer i katalogen ennå.{' '}
                <a href="/admin/prices" style={{ color: C.accent }} target="_blank">Legg til i Admin → Priskatalog</a>
              </p>
            ) : filtered.length === 0 ? (
              <p style={{ padding: '12px 16px', fontSize: '0.72rem', color: C.text3, fontFamily: 'var(--font-dm-sans)' }}>Ingen treff</p>
            ) : useGrouped ? (
              grouped.map(({ cat, items }) => (
                <div key={cat}>
                  <div style={{
                    padding: '6px 16px 4px',
                    fontSize: '0.58rem',
                    fontWeight: 600,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase' as const,
                    color: C.text3,
                    fontFamily: 'var(--font-dm-sans)',
                    borderTop: `1px solid ${C.border}`,
                  }}>
                    {CATEGORY_LABELS[cat] ?? cat}
                  </div>
                  {items.map(item => (
                    <CatalogItem key={item.id} item={item} onSelect={() => { onSelect(item); setOpen(false); setSearch('') }} />
                  ))}
                </div>
              ))
            ) : (
              filtered.map(item => (
                <CatalogItem key={item.id} item={item} onSelect={() => { onSelect(item); setOpen(false); setSearch('') }} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CatalogItem({ item, onSelect }: { item: PriceCatalogItem; onSelect: () => void }) {
  return (
    <button
      type="button"
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '9px 16px',
        fontSize: '0.78rem',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'var(--font-dm-sans)',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = C.surface2}
      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}
      onClick={onSelect}
    >
      <span style={{ color: C.text }}>{item.name}</span>
      <span style={{ color: C.accent, fontSize: '0.72rem', marginLeft: 12, whiteSpace: 'nowrap' }}>
        {item.default_price.toLocaleString('nb-NO')} {item.unit}
      </span>
    </button>
  )
}
```

**Merk:** Fjern den eksisterende inline-knapp-renderen fra den gamle `CatalogPicker` (linjen med `filtered.map(item => (` og `<button key={item.id}...`).

- [ ] **Steg 2: Manuell test**

Gå til tilbud-siden, klikk "Fra katalog" i Utstyrsliste-seksjonen:
- Skal vise kategori-overskrifter: KAMERA, LYS, LYD, UTSTYR
- Søk filtrerer på tvers av alle kategorier, viser bare kategorier med treff
- Klikk på Andre kostnader → "Fra katalog" → skal ikke ha gruppert visning (kun én kategori)

- [ ] **Steg 3: Commit**

```bash
git add components/quote/QuoteBuilder.tsx
git commit -m "feat: group equipment catalog picker by category"
```

---

## Task 4: Auto-populate tilbudsfelter + manglende-felt-banner

**Files:**
- Modify: `app/admin/projects/[id]/quote/page.tsx`
- Modify: `components/quote/QuoteBuilder.tsx`

**Interfaces:**
- Consumes: `project.shoot_end`, `project.project_lead_id`, `project.quote_assignee_id`, `project.language`, `project.project_type`, `profiles` table
- Produces: `QuoteBuilderProps` utvides med `missingFields: { key: string; label: string }[]`

- [ ] **Steg 1: Utvid `projects`-queryen i `loadAll()`**

I `app/admin/projects/[id]/quote/page.tsx`, finn `supabase.from('projects').select('*')` (~linje 39) og erstatt med:

```typescript
supabase.from('projects').select('*, shoot_end, project_lead_id, quote_assignee_id, language, project_type').eq('id', projectId).single(),
```

(`*` inkluderer allerede alle kolonner, men TypeScript-typen trenger at vi kaster nedover. Alternativt: behold `*` og caster `proj` til `unknown as ProjectExtended`.)

Legg til en profiles-fetch i `Promise.all`-arrayen:

```typescript
const [projectRes, teamRes, customersRes, quoteRes, sectionsRes, catalogRes, discountFactorsRes, profilesRes] = await Promise.all([
  supabase.from('projects').select('*').eq('id', projectId).single(),
  supabase.from('team_members').select('*').order('order_index'),
  supabase.from('customers').select('*').order('name'),
  supabase.from('quotes').select('*').eq('project_id', projectId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle(),
  supabase.from('sections').select('id, type').eq('project_id', projectId)
    .eq('type', 'team').maybeSingle(),
  supabase.from('price_catalog').select('*').order('category').order('name'),
  supabase.from('discount_factors').select('*').order('shoot_day'),
  supabase.from('profiles').select('id, name').returns<{ id: string; name: string | null }[]>(),
])
```

- [ ] **Steg 2: Fyll ut manglende felter på `initial`-objektet**

I blokken etter `setBuilderData(initial)` (der `initial.crew = crew` settes), legg til før `setBuilderData(initial)`:

```typescript
const profiles = (profilesRes.data ?? []) as { id: string; name: string | null }[]
const projAny = proj as typeof proj & {
  shoot_end?: string | null
  project_lead_id?: string | null
  quote_assignee_id?: string | null
}

// ourContact: project_lead → quote_assignee → fallback
if (!initial.ourContact || initial.ourContact === 'Bea Valand') {
  const leadId = projAny.project_lead_id ?? projAny.quote_assignee_id
  const lead = leadId ? profiles.find(p => p.id === leadId) : null
  if (lead?.name) initial.ourContact = lead.name
}

// deliveryDate: shoot_end
if (!initial.deliveryDate && projAny.shoot_end) {
  initial.deliveryDate = projAny.shoot_end
}

// language
if (proj?.language === 'en') initial.language = 'EN'
else initial.language = 'NO'

// reference
const typeMap: Record<string, string> = {
  video: 'Video produksjon',
  photo: 'Fotoproduksjon',
  mixed: 'Video og fotoproduksjon',
}
if (proj?.project_type && typeMap[proj.project_type]) {
  initial.reference = typeMap[proj.project_type]
}
```

- [ ] **Steg 3: Legg til manglende-felt-indikator i `QuoteBuilder`**

Utvid `QuoteBuilderProps` med en valgfri prop:

```typescript
interface QuoteBuilderProps {
  // ... eksisterende props ...
  profiles?: { id: string; name: string | null }[]
}
```

Legg til i `QuoteBuilder`-funksjonen (rett etter `const [termsOpen, setTermsOpen] = useState(false)`):

```typescript
const REQUIRED_FIELDS: { key: keyof QuoteBuilderData; label: string }[] = [
  { key: 'clientContact', label: 'Kundekontakt' },
  { key: 'deliveryDate', label: 'Leveringsdato' },
  { key: 'ourContact', label: 'Vår kontakt' },
]

const missingFields = REQUIRED_FIELDS.filter(f => !data[f.key])

const fieldRefs = {
  clientContact: useRef<HTMLInputElement>(null),
  deliveryDate: useRef<HTMLInputElement>(null),
  ourContact: useRef<HTMLInputElement>(null),
}
```

Legg til banner øverst i `return`-blokken, som første barn i den ytterste `<div>`:

```typescript
{missingFields.length > 0 && (
  <div style={{
    background: 'rgba(240,165,0,0.08)',
    border: '1px solid rgba(240,165,0,0.3)',
    borderRadius: 6,
    padding: '10px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap' as const,
    marginBottom: 16,
  }}>
    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: '#F0A500', fontWeight: 600, flexShrink: 0 }}>
      Mangler:
    </span>
    {missingFields.map(f => (
      <button
        key={f.key}
        type="button"
        onClick={() => fieldRefs[f.key as keyof typeof fieldRefs]?.current?.focus()}
        style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem',
          color: '#F0A500', background: 'rgba(240,165,0,0.12)',
          border: '1px solid rgba(240,165,0,0.25)', borderRadius: 4,
          padding: '2px 8px', cursor: 'pointer',
        }}
      >
        {f.label}
      </button>
    ))}
  </div>
)}
```

Legg til `ref`-attributter på de aktuelle input-feltene i header-seksjonen. Finn `data.clientContact`-inputet og legg til `ref={fieldRefs.clientContact}`. Gjør tilsvarende for `deliveryDate` og `ourContact`.

- [ ] **Steg 4: Manuell test**

1. Gå til et nytt tilbud (slett eksisterende quote-data i DB hvis nødvendig)
2. Sjekk at `ourContact` er fylt med project lead-navn (ikke "Bea Valand")
3. Sjekk at `deliveryDate` er satt fra shoot_end
4. Sjekk at `reference` er "Fotoproduksjon" for photo-prosjekter
5. Tøm `clientContact` → banneret skal vise "Kundekontakt"-knapp → klikk → feltet får fokus

- [ ] **Steg 5: Commit**

```bash
git add app/admin/projects/[id]/quote/page.tsx components/quote/QuoteBuilder.tsx
git commit -m "feat: auto-populate quote fields from project data and show missing field banner"
```

---

## Task 5: Tilbudschat med @mentions og varsler

**Files:**
- Create: `lib/actions/quotes.ts`
- Create: `components/quote/QuoteChat.tsx`
- Modify: `app/admin/projects/[id]/quote/page.tsx`

**Interfaces:**
- Consumes: `QuoteMessage` fra `lib/types.ts`, `quote_messages` tabell (task 1), `notifyAssignment` fra `lib/notify-assignment.ts`
- Produces:
  - `getQuoteMessages(quoteId: string): Promise<QuoteMessage[]>`
  - `sendQuoteMessage(opts: { quoteId, projectId, message, mentionedUserIds }): Promise<void>`
  - `<QuoteChat quoteId projectId profiles />` React-komponent

- [ ] **Steg 1: Skriv `lib/actions/quotes.ts`**

```typescript
'use server'

import { createClient } from '@/lib/supabase-server'
import { notifyAssignment } from '@/lib/notify-assignment'
import type { QuoteMessage } from '@/lib/types'

export async function getQuoteMessages(quoteId: string): Promise<QuoteMessage[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('quote_messages')
      .select('*, user:profiles!quote_messages_user_id_fkey(id, name, email)')
      .eq('quote_id', quoteId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('getQuoteMessages error:', error)
      return []
    }
    return (data ?? []) as QuoteMessage[]
  } catch (err) {
    console.error('getQuoteMessages unexpected error:', err)
    return []
  }
}

export async function sendQuoteMessage(opts: {
  quoteId: string
  projectId: string
  message: string
  mentionedUserIds: string[]
}): Promise<{ ok: boolean }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false }

    const { error } = await supabase.from('quote_messages').insert({
      quote_id: opts.quoteId,
      project_id: opts.projectId,
      user_id: user.id,
      message: opts.message.trim(),
      mentions: opts.mentionedUserIds,
    })

    if (error) {
      console.error('sendQuoteMessage insert error:', error)
      return { ok: false }
    }

    // Send varsel til alle taggede brukere (feil svelges)
    const preview = opts.message.slice(0, 120)
    await Promise.all(
      opts.mentionedUserIds.map(recipientId =>
        notifyAssignment({
          recipientId,
          type: 'quote_mention',
          projectId: opts.projectId,
          preview,
        })
      )
    )

    return { ok: true }
  } catch (err) {
    console.error('sendQuoteMessage unexpected error:', err)
    return { ok: false }
  }
}
```

- [ ] **Steg 2: Verifiser TypeScript på quotes.ts**

```bash
npx tsc --noEmit 2>&1 | grep "quotes.ts"
```

Forventet: ingen feil.

- [ ] **Steg 3: Skriv `components/quote/QuoteChat.tsx`**

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { getQuoteMessages, sendQuoteMessage } from '@/lib/actions/quotes'
import type { QuoteMessage } from '@/lib/types'
import { C } from '@/lib/admin-theme'

type Profile = { id: string; name: string | null }

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('nb-NO', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function parseMessage(msg: string): React.ReactNode[] {
  const parts = msg.split(/(@\S+)/g)
  return parts.map((part, i) =>
    part.startsWith('@')
      ? <span key={i} style={{ color: C.accent, fontWeight: 600 }}>{part}</span>
      : <span key={i}>{part}</span>
  )
}

export default function QuoteChat({
  quoteId,
  projectId,
  profiles,
}: {
  quoteId: string
  projectId: string
  profiles: Profile[]
}) {
  const [messages, setMessages] = useState<QuoteMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [mentionedIds, setMentionedIds] = useState<string[]>([])
  const [mentionSearch, setMentionSearch] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getQuoteMessages(quoteId).then(setMessages)
  }, [quoteId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setText(val)

    // Detect @mention trigger
    const cursor = e.target.selectionStart
    const before = val.slice(0, cursor)
    const match = before.match(/@(\w*)$/)
    setMentionSearch(match ? match[1] : null)
  }

  function insertMention(profile: Profile) {
    const name = profile.name ?? profile.id
    const cursor = textareaRef.current?.selectionStart ?? text.length
    const before = text.slice(0, cursor)
    const after = text.slice(cursor)
    const replaced = before.replace(/@(\w*)$/, `@${name} `)
    setText(replaced + after)
    setMentionedIds(prev => prev.includes(profile.id) ? prev : [...prev, profile.id])
    setMentionSearch(null)
    textareaRef.current?.focus()
  }

  async function handleSend() {
    if (!text.trim() || sending) return
    setSending(true)
    const result = await sendQuoteMessage({
      quoteId,
      projectId,
      message: text.trim(),
      mentionedUserIds: mentionedIds,
    })
    if (result.ok) {
      setText('')
      setMentionedIds([])
      const fresh = await getQuoteMessages(quoteId)
      setMessages(fresh)
    }
    setSending(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const mentionSuggestions = mentionSearch !== null
    ? profiles.filter(p =>
        (p.name ?? '').toLowerCase().includes(mentionSearch.toLowerCase())
      ).slice(0, 5)
    : []

  return (
    <div style={{ marginTop: 24 }}>
      <p style={{
        fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600,
        color: C.text2, textTransform: 'uppercase' as const, letterSpacing: '0.08em',
        marginBottom: 12,
      }}>
        Tilbuds-chat
      </p>

      {/* Meldingsliste */}
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
        maxHeight: 320, overflowY: 'auto', padding: '12px 16px',
        display: 'flex', flexDirection: 'column', gap: 12,
        minHeight: 80,
      }}>
        {messages.length === 0 && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, fontStyle: 'italic' }}>
            Ingen meldinger ennå. Bruk @navn for å tagge noen.
          </p>
        )}
        {messages.map(msg => (
          <div key={msg.id}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600, color: C.text }}>
                {msg.user?.name ?? msg.user?.email ?? 'Ukjent'}
              </span>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>
                {formatTime(msg.created_at)}
              </span>
            </div>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text2, margin: 0, lineHeight: 1.5 }}>
              {parseMessage(msg.message)}
            </p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ position: 'relative', marginTop: 8 }}>
        {mentionSuggestions.length > 0 && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 0, marginBottom: 4,
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
            zIndex: 20, minWidth: 180, overflow: 'hidden',
          }}>
            {mentionSuggestions.map(p => (
              <button
                key={p.id}
                type="button"
                onMouseDown={e => { e.preventDefault(); insertMention(p) }}
                style={{
                  width: '100%', display: 'block', textAlign: 'left',
                  padding: '8px 12px', background: 'transparent', border: 'none',
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text,
                  cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = C.surface2}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}
              >
                {p.name ?? p.id}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder="Skriv en melding... Bruk @navn for å tagge"
            style={{
              flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem',
              padding: '8px 12px', borderRadius: 6, resize: 'vertical',
              background: C.surface, border: `1px solid ${C.border}`,
              color: C.text, outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!text.trim() || sending}
            style={{
              padding: '0 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: C.accent, color: '#fff', fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.78rem', fontWeight: 600,
              opacity: !text.trim() || sending ? 0.5 : 1,
              alignSelf: 'flex-end', height: 36, flexShrink: 0,
            }}
          >
            {sending ? '...' : 'Send'}
          </button>
        </div>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3, marginTop: 4 }}>
          Enter for å sende · Shift+Enter for linjeskift
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Steg 4: Koble QuoteChat inn i quote-siden**

I `app/admin/projects/[id]/quote/page.tsx`, legg til import:

```typescript
import QuoteChat from '@/components/quote/QuoteChat'
```

I state-seksjonen øverst:

```typescript
const [profiles, setProfiles] = useState<{ id: string; name: string | null }[]>([])
```

I `loadAll()`, etter `profilesRes` er hentet (fra task 4 — profiles hentes allerede), legg til:

```typescript
setProfiles((profilesRes.data ?? []) as { id: string; name: string | null }[])
```

Legg til chatten etter `<QuoteBuilder ... />`-komponenten i JSX:

```typescript
{existingQuoteId && (
  <QuoteChat
    quoteId={existingQuoteId}
    projectId={projectId}
    profiles={profiles}
  />
)}
```

**Merk:** Chatten vises kun etter tilbudet er lagret første gang (`existingQuoteId !== null`).

- [ ] **Steg 5: Varslings-visning for `quote_mention` i varsler-siden**

Åpne `app/admin/varsler/VarslerClient.tsx` og finn der `task_message` og andre typer rendres i listen. Legg til visning for `quote_mention`:

```typescript
// I notification-item-render, finn switch/if-blokken som viser type-label:
case 'quote_mention':
  return `tagget deg i tilbud`  // brukes i meldings-preview-label
```

Sjekk eksakt pattern i VarslerClient og legg til `quote_mention` i samme stil som de andre typene.

- [ ] **Steg 6: Manuell test**

1. Gå til et tilbud, lagre det (chat vises ikke før lagret)
2. Chat-panelet dukker opp under builderen
3. Skriv `@` + to bokstaver → dropdown med profiler vises
4. Velg en profil → `@Navn` insertes i tekst
5. Send meldingen → vises i listen
6. Sjekk at den taggede brukeren får varsel i `/admin/varsler`

- [ ] **Steg 7: Commit**

```bash
git add lib/actions/quotes.ts components/quote/QuoteChat.tsx app/admin/projects/[id]/quote/page.tsx app/admin/varsler/VarslerClient.tsx
git commit -m "feat: quote chat with @mentions and notifications"
```

---

## Spec Coverage Check

| Spec-punkt | Task |
|---|---|
| Auto-populate ourContact | Task 4 |
| Auto-populate deliveryDate fra shoot_end | Task 4 |
| Auto-populate language | Task 4 |
| Auto-populate reference fra project_type | Task 4 |
| Manglende-felt-banner med klikk-til-fokus | Task 4 |
| Halvdag/1.5 dag knapper | Task 2 |
| Auto-antall utstyr = opptaksdager | Task 2 |
| Auto-antall ved katalog-valg | Task 2 |
| Kategorisert utstyrspicker | Task 3 |
| quote_messages tabell + RLS | Task 1 |
| notifications constraint utvidelse | Task 1 |
| getQuoteMessages server action | Task 5 |
| sendQuoteMessage med notification | Task 5 |
| QuoteChat UI med @mention autocomplete | Task 5 |
| Enter sender, Shift+Enter linjeskift | Task 5 |
| Chat synlig kun etter første lagring | Task 5 |
| quote_mention i varsler-siden | Task 5 |
