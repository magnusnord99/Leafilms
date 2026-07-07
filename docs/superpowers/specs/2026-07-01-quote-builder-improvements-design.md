# Quote Builder Improvements — Design Spec
**Dato:** 2026-07-01  
**Status:** Godkjent

---

## Oversikt

Fem sammenhengende forbedringer av tilbuds-workflowen i Leafilms-plattformen. Alle endringer er i eksisterende quote-builder-arkitektur (`/app/admin/projects/[id]/quote/`, `/components/quote/QuoteBuilder.tsx`, `lib/actions/pipeline.ts`).

---

## 1. Auto-populate tilbudsfelter fra prosjektdata

### Problem
`createEmptyBuilderData` hardkoder `ourContact: 'Bea Valand'` og `reference: 'Video produksjon'`, og henter ikke `deliveryDate` eller `language` fra prosjektet.

### Løsning
I `loadAll()` i quote-siden, etter at prosjekt og profiles er lastet, fyll ut manglende felter:

| Felt | Kilde | Fallback |
|---|---|---|
| `ourContact` | `project.project_lead.name` → `quote_assignee.name` | `'Bea Valand'` |
| `deliveryDate` | `project.shoot_end` | `''` |
| `language` | `project.language` (`no`→`NO`, `en`→`EN`) | `'NO'` |
| `reference` | `project_type`: video→`'Video produksjon'`, photo→`'Fotoproduksjon'`, mixed→`'Video og fotoproduksjon'` | `'Video produksjon'` |

**Viktig:** Disse verdiene brukes kun til initialisering av et nytt tilbud. Eksisterende lagrede tilbud røres ikke (de har allerede `quote_data`).

For å laste `project_lead.name` og `quote_assignee.name` uten den feile `profiles!project_lead_id`-joinen: hent project_lead_id og quote_assignee_id fra prosjektet, slå dem opp i den allerede-lastede `profiles`-listen (som hentes via `getAllProfiles()`). Alternativt: hent `shoot_end` og profilene via separate queries i `loadAll()`.

**Implementasjon:** Utvid `loadAll()` i `app/admin/projects/[id]/quote/page.tsx` til å:
1. Hente `shoot_end`, `project_lead_id`, `quote_assignee_id`, `language`, `project_type` fra projects-queryen
2. Hente alle profiles via `supabase.from('profiles').select('id, name')`
3. Sette feltene på `initial`-objektet

### Manglende-felt-indikator

Et kompakt banner øverst i QuoteBuilder (ikke modal, ikke blokkerende) som viser felter som er tomme:

**Obligatoriske felt som sjekkes:**
- `clientContact` — Kundekontakt
- `deliveryDate` — Leveringsdato
- `ourContact` — Vår kontakt

Banner vises kun når minst ett felt er tomt. Klikk på et felt-navn i banneret → fokuserer på det aktuelle input-feltet (via ref). Banneret forsvinner automatisk når alle felt er fylt.

---

## 2. Halvdag / 1.5 dag på opptaksdager

### Problem
Dag-velgeren i `ShootCrewSection` tilbyr kun heltall 1–7.

### Løsning
Erstatt knappene med en utvidet sekvens: `[0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7]`

**Display:** Vis som `½`, `1`, `1½`, `2`, `2½`, `3`, `4`, `5`, `6`, `7`

**Rabattfaktorer:** `discountFactors`-tabellen har kun hele dager. For halvdager: ingen automatisk rabattfaktor (beholdes som den var). `handleShootDaysChange` endres til å kun oppdatere discount hvis eksakt match finnes.

**Type:** `shootDays: number` i `QuoteBuilderData` — ingen endring nødvendig.

---

## 3. Auto-antall på utstyr = opptaksdager

### Problem
Når opptaksdager endres, oppdateres crew-dagene, men utstyrslinjers `quantity` forblir uendret.

### Løsning
Utvid `handleShootDaysChange` i `QuoteBuilder` til å også oppdatere `equipment`:

```ts
const handleShootDaysChange = useCallback((days: number) => {
  const factor = discountFactors.find(f => f.shoot_day === days)
  setData(prev => ({
    ...prev,
    shootDays: days,
    discountFactor: factor !== undefined ? Number(factor.discount_factor) : prev.discountFactor ?? 0,
    equipment: prev.equipment.map(e => ({ ...e, quantity: days })),
  }))
}, [discountFactors])
```

**Viktig:** Kun utstyr auto-oppdateres — ikke `postProduction`, `otherCosts` eller `licensing`.

**Edge case:** Eksisterende tilbud som lastes fra DB beholder sine lagrede quantities — auto-update skjer kun ved interaksjon i gjeldende økt.

---

## 4. Utstyrskategorisering i katalogvelger

### Problem
`CatalogPicker` viser en flat, søkbar liste uten visuell gruppering.

### Løsning
Når `filterCategories` har 2+ verdier: grupper listen med kategori-overskrifter.

**UI i dropdown:**
```
── KAMERA ──────────────
  Sony FX6           2 400/dag
  DJI RS4 Pro          800/dag
── LYS ─────────────────
  Aputure 600D       1 200/dag
── LYD ─────────────────
  ...
```

**Implementasjon:** I `CatalogPicker`, bygg en `grouped: Record<string, PriceCatalogItem[]>` og render gruppe-header + items. Søk filtrerer på tvers av kategorier (viser bare kategorier med treff).

Kategorirekkefølge følger `filterCategories`-arrayen.

---

## 5. Tilbuds-chat med @mentions og varsler

### Database

**Ny tabell: `quote_messages`**
```sql
create table quote_messages (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  message text not null,
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

-- RLS: brukere kan lese alle meldinger, skrive egne
alter table quote_messages enable row level security;
create policy "authed read" on quote_messages for select to authenticated using (true);
create policy "authed insert" on quote_messages for insert to authenticated with check (auth.uid() = user_id);

-- Legg til ny type i notifications-constraint
-- (se migrasjon)
```

**Notifications:** Legg til `'quote_mention'` i eksisterende `notifications.type`-constraint. `task_id` settes til null, `project_id` settes.

### Server actions (`lib/actions/quotes.ts` — ny fil)

```ts
getQuoteMessages(quoteId): Promise<QuoteMessage[]>
sendQuoteMessage(quoteId, projectId, message, mentionedUserIds[]): Promise<void>
  // parser @mentions fra melding
  // inserter quote_message
  // for hvert mentionedUserId: insert notification (type: 'quote_mention')
```

### UI: Chat-panel i QuoteBuilder

Chatten legges som et eget kollapsbart panel **under** quote-builder-seksjonen på `/projects/[id]/quote/page.tsx`.

**Komponenter:**
- `QuoteChat` — klient-komponent med prop `quoteId` og `projectId`
- Meldingsliste med avsendernavn + tidspunkt
- Textarea med @mention-autocomplete
  - Trigger: `@` → vis dropdown med profilnavn-søk
  - Valg: setter `@Fornavn` i teksten, tracker `mentionedUserIds`
- Send-knapp

**@mention-autocomplete:** Enkel dropdown som filtrerer `profiles` på det brukeren skriver etter `@`. Samme profiles-liste som allerede lastes.

**Polling:** Meldinger lastes én gang ved mount. Ingen realtime/websocket — brukerne refresher manuelt eller laster siden på nytt. (Kan oppgraderes til Supabase Realtime later.)

### Notifications-type
Legg til `'quote_mention'` i `Notification.type` union i `lib/actions/notifications.ts`. Visning i `/admin/varsler`: "du ble tagget i tilbud for [prosjektnavn]".

---

## Migrasjoner

**`080_quote_messages.sql`** (neste ledige nummer):
- Opprett `quote_messages`-tabell med RLS
- Drop + re-add `notifications_type_check` constraint med `'quote_mention'` lagt til:
  `('project_message', 'task_message', 'selection_submitted', 'task_assigned', 'lead_assigned', 'quote_assigned', 'invoice_assigned', 'quote_mention')`

---

## Filer som endres

| Fil | Endring |
|---|---|
| `supabase/migrations/080_quote_messages.sql` | Ny tabell + RLS + constraint |
| `lib/actions/quotes.ts` | Ny: `getQuoteMessages`, `sendQuoteMessage` |
| `lib/actions/notifications.ts` | Legg til `quote_mention` i type union |
| `lib/types.ts` | `QuoteMessage`-type |
| `app/admin/projects/[id]/quote/page.tsx` | Auto-populate, chat-panel |
| `components/quote/QuoteBuilder.tsx` | Halvdager, auto-qty, kategorisering, manglende-felt-indikator |
