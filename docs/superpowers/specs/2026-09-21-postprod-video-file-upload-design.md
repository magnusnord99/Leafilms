# Postprod video-steg: filopplasting erstatter lenker

**Dato:** 2026-09-21
**Status:** Godkjent, klar for implementasjonsplan

## Bakgrunn og mål

I dag har postprod-stegene Grovklipp, Farger, Lyd og Klipp fritekst-lenkefelt
(`TASK_LINK_FIELDS` i `app/admin/postprod/[id]/page.tsx`, lagret som JSON i
`tasks.task_data`) hvor man limer inn en ekstern lenke (f.eks. Filemail) til
råfilen for steget. Leafilms har nå egen R2-bucket med en fungerende, testet
multipart-opplastingsflyt (bygget for sluttleveranser i
`lib/actions/transfers.ts`), og ønsker å bytte ut lenkesystemet på disse
video-stegene med faktisk filopplasting.

Målet er at man på hvert video-steg kan laste opp filen direkte, se en
forhåndsvisning i steget, og sende filen til enten kunde eller kollega for
tilbakemelding — som to atskilte handlinger, ikke én kombinert. Løsningen må
støtte at samme fil sendes i flere versjoner (V1, V2, V3 osv.) med formell
versjonshistorikk.

## Omfang

**Berøres:**
- De fire video-postprod-stegene: Grovklipp, Farger, Lyd, Klipp
  (stegene som i dag har `TASK_LINK_FIELDS`-inputer for `timeline_link`,
  `sounds_link`, `effects_link`).
- Kunde-review-systemet (`video_reviews` / `/v/[token]`), utvidet til å
  kunne spille av R2-filer i tillegg til dagens Supabase Storage-filer.
- Kollega-godkjenningssystemet (`gallery_reviews` / `admin_tasks`), utvidet
  til å kunne trigges fra en opplastet fil i tillegg til dagens galleri.

**Berøres IKKE:**
- Selektering og Redigering (bilde-steg) — beholder dagens
  bildegalleri-flyt (`selection_galleries`, `gallery_reviews` mot galleri)
  uendret.
- Logging-steget — mister sitt `filemail_link`-felt, men får ingen ny
  opplastingsmekanisme. I stedet lenkes brukeren til den allerede
  eksisterende «Filer»-widgeten (ProjectDocuments, migrasjon 143) på
  prosjektsiden, siden Logging-filen konseptuelt tilhører prosjektet, ikke
  selve steget.
- Sluttleveranser (`/d/[token]`, `transfers`-tabellen) — helt separat system,
  ingen endring.
- `extra_links`-mekanismen fjernes for de fire video-stegene (erstattes av
  fri fil-liste), men berører ikke andre stegtyper.

## Datamodell

### Ny tabell: `task_video_files`

Filer knyttet til et video-postprod-steg. Fri liste (ingen fast
«hovedfil»-slot) — brukeren laster opp og navngir filer selv, akkurat som
dagens `extra_links`-mønster, men som faktiske filer.

```sql
CREATE TABLE task_video_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  content_type TEXT,
  uploaded_by UUID REFERENCES profiles(id),
  replaces_file_id UUID REFERENCES task_video_files(id),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- `replaces_file_id` peker til forrige versjon når en fil lastes opp som
  «ny versjon av X». Danner en enkel lenket liste bakover i tid — nyeste
  versjon har ingen andre rader som peker fremover til seg selv utover
  `replaces_file_id`-kjeden, så «siste versjon» finnes ved å følge kjeden
  til enden eller ved å slå opp hvilken rad ingen andre `replaces_file_id`
  peker til.
- RLS: samme mønster som andre `tasks`-relaterte tabeller (kun autentiserte
  admin-brukere, følg eksisterende policy på `tasks`/`admin_tasks`).

### Utvidelse av `video_reviews`

```sql
ALTER TABLE video_reviews
  ADD COLUMN storage_provider TEXT NOT NULL DEFAULT 'supabase'
    CHECK (storage_provider IN ('supabase', 'r2')),
  ADD COLUMN r2_key TEXT,
  ADD COLUMN task_video_file_id UUID REFERENCES task_video_files(id);
```

- Eksisterende rader får `storage_provider='supabase'` (default), fortsatt
  drevet av `storage_path`.
- Nye rader fra postprod-steg får `storage_provider='r2'`, `r2_key` satt,
  `storage_path` NULL.
- `getVideoSignedUrl()` (og tilsvarende funksjoner i
  `lib/actions/video-reviews.ts`) forgrener på `storage_provider` for å
  generere riktig type signert URL.

### Utvidelse av `gallery_reviews`

```sql
ALTER TABLE gallery_reviews
  ADD COLUMN task_video_file_id UUID REFERENCES task_video_files(id);
```

- `gallery_id` (eksisterende kolonne) er NULL når reviewen kommer fra en
  video-fil, og omvendt — nøyaktig én av `gallery_id`/`task_video_file_id`
  skal være satt per rad.
- `requestGalleryReview()`/`respondToGalleryReview()` i
  `lib/actions/gallery-reviews.ts` generaliseres til å håndtere begge
  kildene (eller får en parallell funksjon som deler samme
  `admin_tasks`-opprettelse + status-oppdateringslogikk).

## Opplasting og lagring

- Gjenbruker R2-multipart-mønsteret fra `lib/actions/transfers.ts` og
  `app/admin/transfers/new/TransferUploadClient.tsx`: klienten deler filen
  i 25 MB-biter, laster opp parallelt (4 samtidig) direkte til R2 via
  presignede URL-er — aldri innom Next.js-serveren.
- Ny nøkkel-prefix: `postprod/{task_id}/{randomBytes}/{filnavn}` (adskilt
  fra `transfers/`-prefixet for sluttleveranser).
- Ved fullført opplasting: opprett rad i `task_video_files`. Hvis markert
  som ny versjon, sett `replaces_file_id` til den forrige filens id.
- Avbrutt/feilet opplasting: rydd opp i R2 via samme
  `abortUpload()`-mønster som `transfers.ts` allerede har.

## Forhåndsvisning

- Enkel videoavspiller i steget, basert på `VideoReviewClient`-mønsteret
  men uten PIN-beskyttelse og uten kommentarfelt (internt, admin-only).
- Henter filen via en presignet R2 GET-URL, generalisert fra
  `recordDownload()`-mønsteret i `transfers.ts` til å ikke kreve en
  `transfers`-rad (tar `r2_key` direkte).
- Fil-listen på steget viser nyeste versjon øverst, eldre versjoner
  kollapset i en historikk-seksjon.

## Send til kunde / send til kollega

Begge handlinger er **per fil** (per rad i `task_video_files`), og helt
atskilte — samme fil kan sendes til kunde, til kollega, begge deler, eller
ingen av delene, uavhengig av hverandre. Kun siste versjon i en kjede kan
sendes (hindrer forvirring om hvilken versjon som ble godkjent).

**Send til kunde** (`video_reviews`, `/v/[token]`):
1. Oppretter `video_reviews`-rad med `storage_provider='r2'`, `r2_key`,
   `task_video_file_id` satt. Token + PIN genereres som i dag.
2. Kunden ser og kommenterer på `/v/[token]` med tidsankrede kommentarer
   (`video_comments`) — helt uendret kundeopplevelse.

**Send til kollega** (`gallery_reviews` + `admin_tasks`, generalisert):
1. Oppretter `gallery_reviews`-rad med `task_video_file_id` satt, pluss en
   `admin_tasks`-rad for varsel/oppgave til kollegaen.
2. `tasks.status` settes til `'waiting_review'` på steget.
3. Ved svar: `admin_tasks.status='done'`, `tasks.status` tilbake til
   `'in_progress'` (endringer ønsket) eller videre i flyten (godkjent) —
   samme logikk som dagens `respondToGalleryReview()`.
4. Ingen kunde-vendt lenke eller PIN — ren intern kommunikasjon.

## UI-endringer

- `app/admin/postprod/[id]/page.tsx`: `TASK_LINK_FIELDS`-inputene for
  Grovklipp/Farger/Lyd/Klipp erstattes med en «Filer i dette steget»-seksjon:
  opplastingsknapp/dra-og-slipp, fil-liste med versjonshistorikk,
  forhåndsvisning, «Ny versjon»-knapp, «Send til kunde»/«Send til
  kollega»-knapper og statusvisning («Venter på kundetilbakemelding» /
  «Venter på kollega-godkjenning» / «Godkjent»).
- Logging-steget mister `filemail_link`-feltet, får i stedet en
  snarvei/lenke til Filer-widgeten (ProjectDocuments) på prosjektsiden.
- `extra_links`-knappen («+ Legg til lenke») fjernes for disse fire
  stegene.
- Gamle `task_data`-lenker på pågående prosjekter vises fortsatt
  readonly/arkivert (ikke slettet, ikke lenger redigerbare) — unngår
  datatap uten å kreve migrering av lenkedata til filer.

## Feilhåndtering

- Multipart-opplasting arver samme robusthet som `transfers.ts`
  (retry per del, opprydding ved avbrudd).
- Handlinger som avhenger av migrasjonene under må feile synlig i UI
  (ikke stille) hvis kolonnene ikke finnes ennå.
- Validering: kun siste versjon i en fil-kjede kan sendes til kunde/kollega.

## Testing

Manuell verifisering i browser (ingen automatisert test-suite for
postprod-siden i dag):
1. Last opp fil på Grovklipp → forhåndsvisning fungerer.
2. Last opp «ny versjon» → versjonskjede vises korrekt i historikken.
3. Send til kunde → `/v/[token]` spiller av R2-filen, kommentarer fungerer.
4. Send til kollega → varsel opprettes, `waiting_review`-status settes,
   kollega kan svare og status oppdateres riktig.
5. Regresjon: Selektering/Redigering (bildegalleri) og `/d/[token]`
   (sluttleveranser) fungerer helt uendret.

## Migrasjoner

Neste ledige nummer i `supabase/migrations/` er **160** (siste kjørte er
`159_lead_temperature_deadline.sql`). Faktisk filnavn/nummerering
fastsettes ved implementasjon (sjekk `ls supabase/migrations | tail` på
nytt, siden dette tallet blir utdatert). Følger prosjektets vanlige mønster:
migrasjonene skrives, men kjøres ikke automatisk mot Supabase — de listes
som «uapplied» i `CLAUDE.md` til Magnus ber om at de kjøres.
