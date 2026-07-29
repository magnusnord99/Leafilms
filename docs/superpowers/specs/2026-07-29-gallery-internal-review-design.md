# Intern review av galleri før kunde-tilgang

## Problem

Gallerifunksjonen (`selection_galleries` → `selection_albums` → `selection_images`) har i dag
ingen kvalitetssikring før kunden får lenken. Ønsket: en valgfri intern review-runde der et
teammedlem går gjennom bildene som er lastet opp, velger ut/velger bort blant dem, og
kommenterer — før noe som helst gjøres tilgjengelig for kunden. Reviewer velges fritt hver gang
(ingen fast reviewer bundet til prosjekt/galleri), og reviewen er helt valgfri — mange gallerier
trenger den aldri.

Dette er andre runde av samme mønster som pitch/tilbud-reviewen (`088_task_reviews.sql`,
`docs/superpowers/specs/2026-07-08-review-flow-design.md`): en forespørsel, en reviewer, en
godkjenn/be-om-endringer-beslutning. Forskjellen her er at reviewer i tillegg gjør et faktisk
utvalg blant bildene (ikke bare en tekstkommentar), og at galleriet — i motsetning til pitch/tilbud
sin `project_id NOT NULL`-kobling — kan eksistere helt uten prosjekt (`126_standalone_galleries.sql`).
Derfor gjenbrukes ikke `reviews`-tabellen; det bygges en egen, parallell tabell.

## Datamodell

### Migrasjon `131_gallery_reviews.sql`

(Neste ledige nummer på tidspunktet planen skrives — sjekk `ls supabase/migrations/ | tail` på
nytt før migrasjonen opprettes, i tilfelle nummeret har endret seg.)

```sql
CREATE TABLE gallery_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id uuid NOT NULL REFERENCES selection_galleries(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'changes_requested')),
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  reviewer_id uuid NOT NULL REFERENCES auth.users(id),
  comment text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gallery_reviews_gallery ON gallery_reviews(gallery_id, created_at DESC);

ALTER TABLE gallery_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON gallery_reviews FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE gallery_review_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES gallery_reviews(id) ON DELETE CASCADE,
  image_id uuid NOT NULL REFERENCES selection_images(id) ON DELETE CASCADE,
  keep boolean NOT NULL DEFAULT true,
  note text,
  UNIQUE(review_id, image_id)
);

ALTER TABLE gallery_review_marks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON gallery_review_marks FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE selection_images ADD COLUMN IF NOT EXISTS hidden_from_client boolean NOT NULL DEFAULT false;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned', 'quote_assigned', 'invoice_assigned',
    'quote_mention', 'project_message_mention', 'task_message_mention', 'quote_message',
    'pitch_review_requested', 'pitch_review_responded',
    'quote_review_requested', 'quote_review_responded',
    'gallery_review_requested', 'gallery_review_responded'
  ));
```

**Hvorfor egen tabell og ikke gjenbruk av `reviews`:** `reviews.project_id` er `NOT NULL`, men
gallerier kan være helt frikoblet fra prosjekt. `reviewer_id` velges dessuten ad hoc hver gang
(ikke fra en fast kolonne på et prosjekt/galleri), noe som passer fint inn i samme rad-per-forespørsel-
mønster uten endring.

**Hvorfor `note` på `gallery_review_marks` og ikke gjenbruk av `image_comments` (migrasjon
`130_image_comments.sql`):** `image_comments` vises til kunden i `GalleryClient.tsx`/
`AlbumGalleryClient.tsx` (prikk-indikator + kommentarliste i lightbox). Reviewers interne QA-notater
("ute av fokus, fjern", "trenger et annet bilde av kirken") skal **aldri** være synlige for kunden —
de må derfor holdes i en helt separat, kun-intern tabell, ikke blandes inn i kundens
kommentartråd.

**Hvorfor `hidden_from_client` er en myk skjuling, ikke sletting:** Når reviewer godkjenner,
settes `hidden_from_client = true` for hvert bilde markert `keep = false` i den runden. Bildet
blir stående i galleriet (admin ser det fortsatt, tydelig merket), men filtreres bort fra alt
kunden kan se. Reversibelt — admin kan oppheve merkingen per bilde. Faktisk sletting er en egen,
allerede eksisterende handling (`removeImage`/`purgeGalleryImages`) og endres ikke.

**Statuslogikk (samme som pitch/tilbud):** Siste rad for `(gallery_id)`, sortert på `created_at`,
avgjør status. Ingen rad → aldri sendt til review, ingen sperre. Siste rad `pending` eller
`changes_requested` → kunde-tilgang sperret. Siste rad `approved` → kunde-tilgang åpen.

## Types (`lib/types.ts`)

```typescript
export type GalleryReviewStatus = 'pending' | 'approved' | 'changes_requested'

export type GalleryReview = {
  id: string
  gallery_id: string
  status: GalleryReviewStatus
  requested_by: string
  reviewer_id: string
  comment: string | null
  requested_at: string
  responded_at: string | null
  created_at: string
  requester: { id: string; name: string | null; email: string } | null
  reviewer: { id: string; name: string | null; email: string } | null
}

export type GalleryReviewMark = {
  id: string
  review_id: string
  image_id: string
  keep: boolean
  note: string | null
}
```

`Notification['type']`-unionen får `gallery_review_requested` og `gallery_review_responded`.

## Server actions — `lib/actions/gallery-reviews.ts`

Følger samme mønster som `lib/actions/reviews.ts` (profiler hentes separat, aldri join gjennom
`auth.users`; varsling svelger feil, blokkerer aldri hovedhandlingen).

- `requestGalleryReview(galleryId, reviewerId): Promise<{ ok: boolean }>` — oppretter ny
  `pending`-rad, `requested_by` = innlogget bruker. Varsler reviewer
  (`gallery_review_requested`), lenke til `/admin/selections/[galleryId]/review/[reviewId]`.
- `getLatestGalleryReview(galleryId): Promise<GalleryReview | null>` — brukes til statusbadge og
  sperresjekk.
- `getGalleryReviewHistory(galleryId): Promise<GalleryReview[]>` — full historikk, nyeste først.
- `getGalleryForInternalReview(reviewId): Promise<{ review: GalleryReview; albums: {...}[];
  images: SelectionImage[]; marks: GalleryReviewMark[] }>` — henter galleri + bilder gruppert på
  album (samme aggregering som `getAdminGalleryPage` i `selection-albums.ts`) + eksisterende
  marks for akkurat denne runden (så reviewer beholder fremgang om de forlater siden).
- `saveReviewMark(reviewId, imageId, keep, note?): Promise<{ ok: boolean }>` — upsert på
  `(review_id, image_id)`. Kalles fortløpende mens reviewer jobber, ikke bare ved submit —
  fremgang lagres automatisk.
- `respondToGalleryReview(reviewId, decision: 'approved' | 'changes_requested', comment?):
  Promise<{ ok: boolean }>` — oppdaterer review-raden (`status`, `comment`, `responded_at`). Hvis
  `approved`: setter `selection_images.hidden_from_client = true` for hvert `image_id` med
  `keep = false` blant marks for denne runden. Varsler `requested_by`
  (`gallery_review_responded`). `comment` påkrevd ved `changes_requested`.

## Sperrelogikk i eksisterende kunde-tilgang

Kunde-tilgang går i dag gjennom `verifyGalleryPin`/`verifyAlbumPin` (setter cookie) og deretter
`getGalleryForCustomer`/`getAlbumForCustomer` (leser cookie, returnerer data) i
`lib/actions/selections.ts`/`selection-picks.ts`. Begge stedene — ikke bare ett — må sjekke
review-status, siden en kunde kan ha en gyldig cookie fra en tidligere økt, satt *før* noen ba om
review:

```typescript
const latest = await getLatestGalleryReview(galleryId)
if (latest && latest.status !== 'approved') {
  return { notReady: true } // UI viser "Galleriet er ikke klart ennå"
}
```

Dette gjelder uansett hvilket album-token som brukes — hele galleriet sperres samlet (bekreftet
med Magnus: én review-runde for alt i galleriet, ikke per album). `hidden_from_client = true`-
bilder filtreres i tillegg ut av alle spørringer som bygger kundens bildeliste (både flat modus og
album-modus), uavhengig av sperrelogikken over — dette gjelder også *etter* godkjenning, permanent
til noen opphever merkingen i admin.

## UI

### 1. Galleri-admin (`SelectionAdminClient.tsx` / `SelectionGallery.tsx`)

- Ny "Send til review"-knapp på galleri-nivå → modal med `<select>` av teammedlemmer (samme
  `profiles`-kilde som andre steder i appen), kaller `requestGalleryReview`.
- Statusbadge (samme fargekonvensjon som `ReviewPanel`): grå *Ikke sendt til review* / gul
  *Venter på review* / grønn *Godkjent* / rød *Endringer ønsket* — sistnevnte med kommentaren
  synlig ved siden av.
- Utvidbar "Review-historikk" under badgen (skjult som standard, samme disclosure-mønster som
  `ReviewPanel`), viser `getGalleryReviewHistory`-resultatet.
- Bilder med `hidden_from_client = true` vises fortsatt for admin, tydelig merket ("Skjult for
  kunde"), med en enkel knapp for å oppheve merkingen per bilde.
- Admin-lilla fargepalett (`lib/admin-theme.ts`), som resten av `/admin/*`.

### 2. Reviewer-siden — `app/admin/selections/[galleryId]/review/[reviewId]/page.tsx`

Egen, ny rute nestet under den allerede prosjekt-uavhengige `/admin/selections/[galleryId]`-
strukturen (fungerer dermed likt for gallerier med og uten prosjekt-kobling). Dette er "den andre
lenken" — en innlogget, intern rute, helt adskilt fra kundens `/s/[token]`:

- Viser alle bilder gruppert på album (samme visuelle gruppering som admin-visningen), men en
  enklere, fokusert visning — ingen album-CRUD, ingen opplasting, ingen deling/PIN-kontroller.
- Per bilde: en "Behold i utvalg"-toggle (default på/kept) + valgfritt internt notatfelt. Endringer
  lagres fortløpende via `saveReviewMark` (autolagring, ikke bundet til en submit-handling).
- Ett overordnet kommentarfelt for hele runden.
- To knapper nederst: **Godkjenn** (kaller `respondToGalleryReview(id, 'approved', comment)`) og
  **Be om endringer** (kommentar påkrevd, `respondToGalleryReview(id, 'changes_requested', comment)`).
- Varselet i `/admin/varsler` (`VarslerClient.tsx`, `handleClick`) ruter begge nye typene hit.

## Ikke i scope

- Ingen fast reviewer-tildeling på prosjekt/galleri-nivå — reviewer velges fritt hver gang
  "Send til review" trykkes.
- Ingen sperre per album — hele galleriet låses/åpnes samlet, uavhengig av hvor mange album det
  inneholder.
- Ingen automatisk "legg til nytt bilde"-mekanisme fra reviewers notat ("trenger et annet bilde av
  X") — dette er tekst noen leser og handler på manuelt, ikke en oppgave-generering.
- Ingen endring i klientens egen pick/kommentar-flyt (`toggleImageSelection`,
  `toggleAlbumImagePick`, `addImageComment` osv.) — dette er et rent forhåndssteg som filtrerer
  *hvilke* bilder kunden i det hele tatt får presentert.
- Ingen automatisk tilbakestilling av `hidden_from_client` ved senere opplasting/redigering —
  admin må aktivt oppheve det per bilde.
- Ingen egen mekanisme for at klienten skal se at et bilde ble fjernet av review — det er som om
  bildet aldri var der.

## Testing

Ingen automatisert testsuite i prosjektet (jf. tidligere spec-er). Manuell verifisering:

1. Last opp bilder til et nytt/eksisterende galleri, bekreft at kunde-lenken virker som i dag
   (ingen review bedt om ennå → ingen sperre).
2. Trykk "Send til review", velg en annen bruker som reviewer → bekreft varsel dukker opp i
   `/admin/varsler` for reviewer, klikk det → havner på reviewer-siden.
3. Bekreft at kunde-lenken (og alle album-lenker under galleriet) nå viser "ikke klar ennå" —
   både for en helt ny PIN-sesjon og for en økt som allerede hadde gyldig cookie fra før.
4. Reviewer markerer noen bilder som "ikke behold", legger notat på ett, trykker **Be om
   endringer** med kommentar → avsender får varsel, kunde-lenken fortsatt sperret, kommentar
   synlig i historikk, ingen bilder skjult ennå (kun `approved` trigger skjuling).
5. Trykk "Send til review" på nytt (kan velge samme eller annen reviewer) → reviewer trykker
   **Godkjenn** → kunde-lenken/album-lenkene fungerer nå, bildene markert "ikke behold" er borte
   fra kundens visning men synlige (merket) i admin.
6. Admin opphever `hidden_from_client` på ett bilde manuelt → bekreft det dukker opp igjen for
   kunden.
7. Bekreft at `tsc --noEmit`, `eslint` og `npm run build` er grønne.
