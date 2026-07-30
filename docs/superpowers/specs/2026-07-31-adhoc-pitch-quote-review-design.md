# Ad hoc pitch/tilbud-review (samme mønster som galleri-review)

## Problem

Pitch- og tilbud-review (`088_task_reviews.sql`, `docs/superpowers/specs/2026-07-08-review-flow-design.md`)
krever i dag at en admin på forhånd huker av "Krev godkjenning av pitch/tilbud"
(`pitch_review_enabled`/`quote_review_enabled`) på prosjektet og velger en fast
reviewer (`pitch_reviewer_id`/`quote_reviewer_id`) i prosjektinnstillingene. Er dette
ikke satt opp, kan man ikke sende til review i det hele tatt. Er det satt opp, er
reviewer fast — man kan ikke velge en annen person for én enkelt runde uten å endre
prosjektinnstillingen først. I tillegg *blokkerer* en aktiv `enabled`-innstilling
deling med kunde til review er `approved`.

Ønsket (bekreftet med Magnus): samme mønster som galleri-review
(`docs/superpowers/specs/2026-07-29-gallery-internal-review-design.md`) — reviewer
(og en valgfri frist) velges ad hoc, der og da, hver gang noen trykker "Send til
review". Ingen forhåndskonfigurering. Ingen sperre — review er et rent frivillig
sikkerhetsnett, aldri en blokkering av deling med kunde. Dette gjelder **både** pitch-
og tilbud-review — begge bytter til samme ad hoc-mønster, ikke bare tilbud.

## Datamodell

I motsetning til galleri-review (som fikk en helt egen tabell fordi gallerier kan
mangle prosjekt) gjenbrukes den eksisterende `reviews`-tabellen her — `project_id` er
allerede `NOT NULL` og passer fint, og `subject_type` skiller allerede pitch/tilbud.
Legger bare til det galleri-review-tabellen har og som mangler her: en valgfri frist
og en kobling til oppgaven som opprettes hos reviewer.

### Migrasjon (neste ledige nummer — sjekk `ls supabase/migrations | tail` OG `git status --short`
på nytt rett før migrasjonen skrives, se project-memory `feedback_migration_number_races`;
det har vært høy trafikk på migrasjonsnumre denne uken)

```sql
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS admin_task_id uuid REFERENCES admin_tasks(id) ON DELETE SET NULL;

ALTER TABLE projects DROP COLUMN IF EXISTS pitch_review_enabled;
ALTER TABLE projects DROP COLUMN IF EXISTS pitch_reviewer_id;
ALTER TABLE projects DROP COLUMN IF EXISTS quote_review_enabled;
ALTER TABLE projects DROP COLUMN IF EXISTS quote_reviewer_id;
```

**Hvorfor `admin_task_id` er `ON DELETE SET NULL`, ikke `CASCADE`:** review-raden er
historikk (vises i `ReviewPanel`s historikk-liste) og skal bestå selv om noen sletter
den tilhørende oppgaven manuelt fra oppgavelisten — den mister bare koblingen, ikke
seg selv. Motsatt vei (sletter man review-raden) skal oppgaven bli stående (ingen
`ON DELETE CASCADE`/trigger fra review til task), samme retning som galleri-review
ikke håndterer heller — det er ikke i scope å rydde oppgaver ved review-sletting.

**Hvorfor kolonnene på `projects` droppes og ikke bare slutter å bli lest:** Magnus
bekreftet full erstatning, ikke sameksistens — å la de døde kolonnene bli stående
ville vært forvirrende støy for neste utvikler som leser skjemaet.

## Types (`lib/types.ts`)

```typescript
export type Review = {
  id: string
  project_id: string
  subject_type: ReviewSubjectType
  status: 'pending' | 'approved' | 'changes_requested'
  requested_by: string
  reviewer_id: string
  due_date: string | null
  admin_task_id: string | null
  comment: string | null
  requested_at: string
  responded_at: string | null
  created_at: string
  requester: { id: string; name: string | null; email: string } | null
  reviewer: { id: string; name: string | null; email: string } | null
}
```

Fjern `pitch_review_enabled`, `pitch_reviewer_id`, `quote_review_enabled`,
`quote_reviewer_id` fra prosjekt-typen i `lib/types.ts`.

`Notification`-typen og `notifications_type_check`-constrainten trenger **ingen**
endring — `pitch_review_requested`/`pitch_review_responded`/`quote_review_requested`/
`quote_review_responded` finnes allerede.

## Server actions — `lib/actions/reviews.ts`

- `requestReview(projectId, subjectType, reviewerId, dueDate?): Promise<{ ok: boolean; error?: string }>`
  — reviewer sendes nå eksplisitt som argument (leses ikke lenger fra
  `pitch_reviewer_id`/`quote_reviewer_id` på prosjektet, siden de kolonnene er borte).
  Oppretter en `admin_tasks`-rad tildelt `reviewerId` med tittel
  `Godkjenn {pitch/tilbud} — {prosjekttittel}` og `due_date`, lagrer `admin_task_id`
  på den nye review-raden — samme mønster som `requestGalleryReview`
  (`lib/actions/gallery-reviews.ts:51-134`). Varsler som i dag
  (`pitch_review_requested`/`quote_review_requested`).
- `respondToReview(reviewId, decision, comment?): Promise<{ ok: boolean; error?: string }>`
  — samme som i dag, men: (1) `comment` er nå påkrevd når `decision === 'changes_requested'`
  (matcher `respondToGalleryReview`s validering), (2) setter det tilknyttede
  `admin_tasks.status = 'done'` hvis `admin_task_id` er satt (samme som galleri-review
  gjør ved svar).
- `updateReviewSettings` **fjernes** — ingenting igjen å konfigurere.
- `getReviewHistory`/`getLatestReview` uendret i signatur.

## UI

### `components/project/ReviewPanel.tsx`

- `enabled`-propen fjernes — komponenten returnerer aldri `null` lenger, den vises
  alltid for begge typer.
- "Send til review"-knappen (der `!latest || latest.status !== 'pending'`) endrer
  oppførsel: i stedet for å kalle `requestReview` direkte, åpner den et lite
  inline-panel — samme UX som `GalleryReviewPanel` (`SelectionAdminClient.tsx:562-596`):
  en `<select>` med teammedlemmer (`profiles`, samme kilde som andre steder), et
  valgfritt `<input type="date">` for frist, og Send/Avbryt-knapper. "Send" kaller
  `requestReview(projectId, subjectType, reviewerId, dueDate || undefined)`.
- Historikk-visning, status-badge og godkjenn/be-om-endringer-svarpanelet
  (linje 94-220 i dag) er allerede riktig utformet — ingen endring der utover at
  "Be om endringer" fortsatt krever tekst i kommentarfeltet (allerede validert
  client-side per eksisterende kode — bekreft at server-siden nå også håndhever det,
  se over).

### `app/admin/projects/[id]/page.tsx` ("Pitch & Tilbud"-fanen, linje ~1719-1765)

- De to radene med avkrysningsboks ("Krev godkjenning av …") + betinget
  reviewer-`<select>` fjernes helt.
- `<ReviewPanel projectId={...} subjectType="pitch" currentUserId={...} />` og
  tilsvarende for `"quote"` vises direkte, uten noe rundt — ingen `enabled`-prop å
  sende med lenger.
- `handleReviewSettingChange` (linje 1184) fjernes, siden `updateReviewSettings` er
  borte.

### `app/admin/projects/new/page.tsx`

- De tilsvarende feltene i nytt-prosjekt-veiviseren (linje ~309-316, ~721-722)
  fjernes — ingenting å konfigurere ved opprettelse lenger.

### `hooks/project/usePublishing.ts`

- Blokkerings-sjekken i `togglePublish` (linje 42-59 i dag: `if (project?.pitch_review_enabled) { ... blokkerer ... }`
  og tilsvarende for tilbud) fjernes helt. Deling med kunde blir uavhengig av
  review-status — samme som galleri-review, hvor review aldri sperrer noe.
- Fjern `getLatestReview`-importen i denne filen hvis den ikke brukes til noe annet
  etter dette (sjekk resten av filen — sjekkes ved implementasjon).

## Ikke i scope

- Ingen endring i galleri-review (`gallery_reviews`, `GalleryReviewPanel`,
  `/admin/selections/[galleryId]/review/[reviewId]`) — den er allerede i riktig
  mønster og er selve malen dette bygger på.
- Ingen migrering av eksisterende `reviews`-rader — historikk (`requester`/`reviewer`/
  `status`/`comment`) beholdes som den er, de får bare `due_date = null` og
  `admin_task_id = null` retroaktivt siden kolonnene er nye.
- Ingen ny varslingstype, ingen endring i `VarslerClient.tsx`s routing-logikk eller
  i `lib/push-notification-content.ts` — `pitch_review_requested`/`quote_review_requested`/
  `*_responded` ruter allerede riktig til `/admin/projects/{id}?tab=pitch`, og det er
  fortsatt riktig destinasjon (ingen egen full-side review-visning trengs her, i
  motsetning til galleri, siden pitch/tilbud-review er en enkel godkjenn/kommenter-
  handling uten per-bilde-markering).
- Ingen endring i selve pitch- eller tilbud-innholdet/bygging — dette er kun
  review-laget rundt dem.

## Testing

Ingen automatisert testsuite i prosjektet. Manuell verifisering:

1. Åpne et eksisterende prosjekt, "Pitch & Tilbud"-fanen — bekreft at de gamle
   "Krev godkjenning"-radene er borte, og at `ReviewPanel` for begge typer vises
   direkte med en "Send til review"-knapp, uansett tidligere `enabled`-verdi på
   prosjektet.
2. Trykk "Send til review" på tilbudet, velg en kollega som reviewer og en frist →
   bekreft at kollegaen får varsel i `/admin/varsler` OG en ny oppgave i sin
   oppgaveliste med riktig frist.
3. Del tilbudet med kunden mens reviewen fortsatt er `pending` → bekreft at dette nå
   fungerer uhindret (ingen sperre lenger).
4. Reviewer trykker "Be om endringer" uten å skrive kommentar → bekreft at det
   avvises (server-side, ikke bare client-side). Skriv kommentar, send → bekreft
   varsel til avsender, oppgaven markert fullført.
5. Send til review på nytt, denne gangen en annen reviewer, trykk "Godkjenn" →
   bekreft varsel, oppgave fullført, historikk viser begge rundene i riktig
   rekkefølge.
6. Gjenta 1-5 for pitch (samme flyt, samme fane, andre subject_type).
7. Åpne "Nytt prosjekt"-veiviseren, bekreft at de gamle review-innstillingsfeltene
   er borte.
8. Bekreft at `tsc --noEmit`, `eslint` og `npm run build` er grønne.
