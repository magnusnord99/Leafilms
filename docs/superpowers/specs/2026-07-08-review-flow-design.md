# Review-flyt for pitch og tilbud

## Problem

Det finnes ingen måte å be en kollega om å kvalitetssjekke en pitch eller et pristilbud før det
går ut til kunde. I dag er "Publiser" (som gjør prosjektet — inkludert eventuell tilbudsseksjon —
synlig på `/p/[token]`) en enveis-handling uten noe godkjenningssteg.

Ønsket: en generell "trenger review"-mekanisme man kan slå på per prosjekt, med en valgt
kollega som reviewer. Reviewer varsles, og kan enten godkjenne eller sende tilbake med en
kommentar. Så lenge noe er sendt til review og ikke godkjent, skal man ikke kunne publisere.

Denne runden bygges funksjonen **kun for to konkrete objekter**: pitch (selve prosjektet/
pitch-innholdet) og tilbud (`Quote`). Datamodellen er generell nok til å utvide til flere
objekttyper senere, men UI og sperrelogikk bygges kun for disse to nå.

## Hvorfor "publisering" er riktig sperrepunkt for begge

`Quote`-seksjonen (`components/sections/QuoteSection.tsx`) rendres som en vanlig seksjon inni
selve pitchen (`app/p/[token]/PublicProjectClient.tsx`), og blir synlig for kunden i det
øyeblikket prosjektet publiseres (`hooks/project/usePublishing.ts`, `togglePublish`). Det finnes
ingen egen "send tilbud til kunde"-handling i kodebasen i dag — tilbudet distribueres alltid som
en del av pitch-publiseringen. Derfor sperrer både pitch- og tilbud-review den samme
"Publiser"-knappen, men vises og spores som to uavhengige statuser.

## Datamodell

### Migrasjon `088_task_reviews.sql`

(Neste ledige nummer på tidspunktet planen skrives — `085_` er committet, og en parallell
arbeidsøkt har uncommittede `086_`/`087_` liggende i samme working directory. Sjekk
`ls supabase/migrations/` på nytt før migrasjonen opprettes, i tilfelle nummeret har endret seg.
CLAUDE.md sier fortsatt `065_`, som er utdatert.)

```sql
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS pitch_review_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pitch_reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quote_review_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quote_reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('pitch', 'quote')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'changes_requested')),
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  reviewer_id uuid NOT NULL REFERENCES auth.users(id),
  comment text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reviews_project_subject ON reviews(project_id, subject_type, created_at DESC);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
-- Samme mønster som resten av appen: innloggede brukere (hele det interne teamet) har full tilgang.
CREATE POLICY "authenticated_full_access" ON reviews FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned', 'quote_assigned', 'invoice_assigned',
    'quote_mention', 'project_message_mention', 'task_message_mention', 'quote_message',
    'pitch_review_requested', 'pitch_review_responded',
    'quote_review_requested', 'quote_review_responded'
  ));
```

**Hvorfor én ny rad per innsending, ikke oppdatering av én rad:** Hver gang noen trykker "Send
til review" opprettes en ny `reviews`-rad med status `pending`, i stedet for å gjenbruke/nullstille
en eksisterende rad. Det gir full historikk gratis — alle rader for `(project_id, subject_type)`,
sortert på `created_at`, *er* loggen. Siste rad avgjør gjeldende status:

- Ingen rad finnes → "ikke sendt til review ennå" (sperrer ikke publisering med mindre
  `*_review_enabled` er satt og ingen godkjent runde finnes)
- Siste rad `pending` → venter på svar, sperrer publisering
- Siste rad `approved` → publisering tillatt
- Siste rad `changes_requested` → sperrer publisering, kommentar vises

Godkjenning nullstilles **ikke** automatisk ved senere redigeringer — den står til noen selv
trykker "Send til review" på nytt (bekreftet valg, enklere enn å spore innholdsendringer).

## Types

I `lib/types.ts`:

```typescript
export type ReviewSubjectType = 'pitch' | 'quote'
export type ReviewStatus = 'pending' | 'approved' | 'changes_requested'

export type Review = {
  id: string
  project_id: string
  subject_type: ReviewSubjectType
  status: ReviewStatus
  requested_by: string
  reviewer_id: string
  comment: string | null
  requested_at: string
  responded_at: string | null
  created_at: string
  requester: { id: string; name: string | null; email: string } | null
  reviewer: { id: string; name: string | null; email: string } | null
}
```

`Project`-typen får de fire nye feltene (`pitch_review_enabled`, `pitch_reviewer_id`,
`quote_review_enabled`, `quote_reviewer_id`).

`Notification['type']`-unionen får de fire nye typene.

## Server actions — `lib/actions/reviews.ts`

Følger samme mønster som `lib/actions/quotes.ts` (profiler hentes separat, aldri join gjennom
`auth.users`) og `lib/notify-assignment.ts` (varsling svelger feil, blokkerer aldri
hovedhandlingen).

- `getReviewHistory(projectId, subjectType): Promise<Review[]>` — alle rader, nyeste først, med
  requester/reviewer-profiler slått sammen inn.
- `getLatestReview(projectId, subjectType): Promise<Review | null>` — brukes til status-badge og
  sperresjekk.
- `requestReview(projectId, subjectType): Promise<{ ok: boolean }>` — leser
  `pitch_reviewer_id`/`quote_reviewer_id` fra prosjektet, oppretter ny `pending`-rad med
  `requested_by = innlogget bruker`, sender varsel (`pitch_review_requested` /
  `quote_review_requested`) til reviewer. Returnerer `{ ok: false }` uten å opprette noe hvis
  review er slått på men reviewer mangler (kan skje hvis en tidligere valgt reviewer er slettet
  fra `profiles`) — "Send til review"-knappen skal da vise en feilmelding om å velge reviewer i
  prosjektinnstillingene først.
- `respondToReview(reviewId, decision: 'approved' | 'changes_requested', comment?: string): Promise<{ ok: boolean }>`
  — oppdaterer raden (`status`, `comment`, `responded_at`), sender varsel
  (`pitch_review_responded` / `quote_review_responded`) tilbake til `requested_by`.
- `updateReviewSettings(projectId, { pitch_review_enabled?, pitch_reviewer_id?, quote_review_enabled?, quote_reviewer_id? }): Promise<{ ok: boolean }>`
  — oppdaterer de fire kolonnene på `projects`.

Varsling gjenbruker `notifyAssignment`-mønsteret (egen liten `notifyReview`-hjelper i samme fil
eller i `lib/notify-assignment.ts`) — henter avsenders profil, hopper over selv-varsling, skriver
til `notifications` med `createServiceClient()`.

## UI

### 1. Ved prosjektopprettelse — `app/admin/projects/new/page.tsx`

Ny seksjon "Review" (samme `sectionDivider`/`fieldLabel`-mønster som resten av skjemaet), med to
rader — én for pitch, én for tilbud:

- Av/på-bryter (samme `chipBtn`-mønster som språkvalg): "Krev godkjenning"
- Når på: en `<select>` med `profiles`-lista (samme kilde som `customers`-lista hentes fra i
  dag, ny `supabase.from('profiles').select('id, name, email')`-kall) for å velge reviewer.

Verdiene sendes med i `.insert()`-kallet til `projects`. Valgfritt — default av, ingen krav om
utfylling.

### 2. Endre senere — `app/admin/projects/[id]/page.tsx`, "Pitch & Tilbud"-fanen

Samme kontroller (av/på + reviewer-dropdown, ett par per type) legges øverst i
`activeTab === 'pitch'`-blokken (rundt linje 1363), over de to eksisterende kortene
("Pitch-dokument" / "Tilbud"). Bruker `profiles`-state som allerede er hentet i denne
komponenten (linje 603, fylt via `getAllProfiles` i `useEffect`, samme kilde som
Prosjektleder-velgeren rundt linje 940–1024 bruker). Kaller `updateReviewSettings`.

### 3. Ett samlet sted: "Pitch & Tilbud"-fanen i prosjekthub-en

`app/admin/projects/[id]/page.tsx` har allerede en `activeTab === 'pitch'`-fane ("Pitch & Tilbud")
som viser to kort — "Pitch-dokument" (lenke til `/edit`) og "Tilbud" (lenke til `/quote`, med
statusbadge for `quote.status`) — rundt linje 1363–1400. Dette er det naturlige, allerede
eksisterende stedet for all review-UI, i stedet for å spre det ut over redigeringssidene:

- Én ny gjenbrukbar komponent, `components/project/ReviewPanel.tsx`, tar
  `projectId: string, subjectType: 'pitch' | 'quote', enabled: boolean,
  currentUserId: string | null` som props — selvforsynt, henter selv `getReviewHistory` ved
  mount og gjør egne kall til `requestReview`/`respondToReview`.
- Rendres to ganger, i et eget "Review"-innstillingsblokk øverst i "Pitch & Tilbud"-fanen (én
  rad per type, med av/på-bryter + reviewer-dropdown ved siden av), i stedet for inni hvert
  av de to eksisterende kortene ("Pitch-dokument" / "Tilbud") — enklere å implementere og
  holder alt review-relatert samlet ett sted, uten å endre de to kortenes egen struktur.
- Viser: statusbadge (`Ikke sendt til review` grå / `Venter på review` gul / `Godkjent` grønn /
  `Endringer ønsket` rød), en "Send til review"-knapp (kaller `requestReview`), og — når
  innlogget bruker er reviewer og siste review er `pending` — en liten banner med
  **Godkjenn** (`respondToReview(id, 'approved')`) og **Be om endringer** (åpner tekstboks,
  kommentar påkrevd, `respondToReview(id, 'changes_requested', comment)`).
- Komponenten vises kun når `enabled` er `true` for den aktuelle typen.

Varselet i `/admin/varsler` (`VarslerClient.tsx`, `handleClick`) ruter alle fire nye typene til
samme sted: `/admin/projects/[id]?tab=pitch` — `activeTab` leses allerede fra `?tab=`-query
param ved mount (linje 592–596), så ingen endring trengs i hub-siden for at lenken skal treffe
riktig fane.

### 4. Historikk

`ReviewPanel` har en utvidbar seksjon ("Review-historikk") under statusbadgen — viser
`getReviewHistory`-resultatet: hver runde med requester → reviewer, status, kommentar (hvis
`changes_requested`), tidspunkt. Skjult som standard, ekspanderes ved klikk (samme
disclosure-mønster som andre paneler i appen).

## Sperrelogikk

`hooks/project/usePublishing.ts`, `togglePublish`, PUBLISER-grenen — før noe skrives til databasen:

```typescript
if (project.pitch_review_enabled) {
  const latest = await getLatestReview(projectId, 'pitch')
  if (latest?.status !== 'approved') {
    alert(`Pitchen må godkjennes${latest?.reviewer ? ' av ' + (latest.reviewer.name ?? latest.reviewer.email) : ''} først.`)
    setPublishing(false)
    return
  }
}
if (project.quote_review_enabled) {
  const latest = await getLatestReview(projectId, 'quote')
  if (latest?.status !== 'approved') {
    alert(`Tilbudet må godkjennes${latest?.reviewer ? ' av ' + (latest.reviewer.name ?? latest.reviewer.email) : ''} først.`)
    setPublishing(false)
    return
  }
}
```

Begge sjekkes uavhengig av hverandre — trenger prosjektet review på begge, må begge være
`approved`. AVPUBLISER-grenen påvirkes ikke.

## Ikke i scope

- Ingen andre objekttyper enn pitch og tilbud denne runden (selv om `reviews.subject_type` er
  laget generisk nok til å utvide senere — CLAUDE.md-filosofien tilsier at vi ikke bygger UI for
  hypotetiske fremtidige typer nå).
- Ingen egen "send tilbud til kunde"-handling innføres — tilbudet distribueres fortsatt kun som
  del av pitch-publisering, som i dag.
- Ingen automatisk nullstilling av godkjenning ved senere redigering.
- Ingen sperre på selve redigeringen (man kan redigere pitch/tilbud fritt mens en review er
  `pending` eller `changes_requested` — sperren gjelder kun selve "Publiser"-handlingen).
- Ingen begrensning på å velge seg selv som reviewer — varslingen hopper da bare over
  selv-varsling, samme som `notifyAssignment` gjør i dag.

## Testing

Ingen automatisert testsuite i prosjektet (jf. tidligere spec-er). Manuell verifisering:

1. Opprett nytt prosjekt med "Krev godkjenning av pitch" på, reviewer = en annen bruker →
   bekreft feltene lagres på `projects`.
2. Trykk "Publiser" uten å ha sendt til review → skal blokkeres med melding.
3. Trykk "Send til review" → logg inn som reviewer → se varsel i `/admin/varsler`, klikk det →
   havner på pitch-editoren, ser banner.
4. Reviewer trykker "Be om endringer" med kommentar → opprinnelig bruker får varsel, "Publiser"
   fortsatt blokkert, kommentar synlig i historikk.
5. Trykk "Send til review" på nytt → reviewer trykker "Godkjenn" → "Publiser" fungerer nå.
6. Rediger pitchen etter godkjenning → "Publiser" skal fortsatt fungere (ingen automatisk
   nullstilling).
7. Gjenta 2–6 for tilbud (`/admin/projects/[id]/quote`), bekreft at pitch- og tilbud-status er
   uavhengige av hverandre.
8. Bekreft at `tsc --noEmit`, `eslint` og `npm run build` er grønne.
