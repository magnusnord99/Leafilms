# Video inni samme galleri/album som bilder

## Bakgrunn

I dag er bilde-galleriet (`selection_galleries`/`selection_albums`/`selection_images`, administrert i `/admin/projects/[id]/selection`) og video-review (`video_reviews`, administrert i en helt separat `/admin/projects/[id]/video`-fane) to atskilte flyter. En video kan kobles til et galleri via en bryter ("Vis i kundens seleksjonsgalleri"), men vises da kun som et eget kort på **galleriets toppnivå** — aldri inni et spesifikt album sammen med bildene fra samme opptak.

Bruksbehov: når dere har laget et grovklipp og vil ha kundens feedback før dere jobber videre, skal videoen kunne legges rett inn i samme album som bildene fra det opptaket — ikke administreres fra en egen side og kun dukke opp på et løsrevet toppnivå.

## Endringer

### 1. Datamodell

Ny migrasjon `supabase/migrations/089_video_in_album.sql`:
```sql
ALTER TABLE video_reviews ADD COLUMN IF NOT EXISTS album_id UUID REFERENCES selection_albums(id) ON DELETE SET NULL;
```

Regel: en video med `album_id` satt vises **kun** inni det albumet, ikke på galleriets toppnivå (samme mønster som bilder, som heller ikke vises dobbelt). Videoer uten `album_id` (kun `gallery_id`, dagens eksisterende data) fortsetter uendret på toppnivået — full bakoverkompatibilitet.

`lib/actions/video-reviews.ts`:
- `createVideoReview(projectId, title, storagePath, galleryId?, albumId?)` — ny valgfri `albumId`-parameter, satt sammen med `gallery_id` når video lastes opp inni et album.
- `getGalleryVideos(galleryId)` — legg til `.is('album_id', null)` slik at album-plasserte videoer ikke også dukker opp på toppnivået.
- Ny `getAlbumVideos(albumId): Promise<VideoReview[]>` — henter videoer for ett spesifikt album (samme spørring som `getGalleryVideos`, filtrert på `album_id` i stedet).

### 2. Admin: last opp video rett i albumet

`SelectionAdminClient.tsx` → `AlbumDetailPanel`: ny knapp **"+ Last opp video"** ved siden av dagens "+ Last opp bilder". Video lastes opp til samme `videos`-storage-bucket som i dag (uendret 2GB-grense), deretter kalles `createVideoReview(projectId, title, storagePath, galleryId, albumId)`.

Album-rutenettet (der bilder vises i dag) viser video som et eget kort ved siden av bildene — gjenbruker utseendet fra dagens `VideoCard` (play-ikon, tittel, status-/kommentar-badge), nå plassert inni albumets rutenett i stedet for kun på galleri-toppnivået. Klikk på kortet i admin åpner samme eksisterende adminvisning for kommentarer/status (`/admin/projects/[id]/video`) — selve gjennomgangen av video og kommentarer er uendret, kun *hvor* man laster opp og *hvor* kortet vises endres.

Den eksisterende frittstående "/video"-fanen i admin beholdes for videoer som ikke hører til et spesifikt album (f.eks. en oppsummeringsvideo for hele prosjektet) — disse bruker fortsatt kun `gallery_id`, ingen `album_id`, og vises på toppnivået som i dag.

### 3. Kundevisning

`app/s/[token]/[album]/AlbumGalleryClient.tsx` (album-visningen kunden ser): henter nå også videoene for albumet (`getAlbumVideos`, eksponert via en tilsvarende utvidelse av `getAlbumForCustomer` i `lib/actions/selection-picks.ts`) og viser dem som kort i samme rutenett som bildene — gjenbruker `VideoCard`-utseendet fra dagens toppnivå-oversikt (`AlbumOverviewClient.tsx`).

Klikk på video-kortet navigerer til den **eksisterende, separate siden** `/s/[token]/video/[reviewId]` med full avspiller og tidsstemplet kommentarfelt (`VideoReviewClient`, uendret) — ikke inn i bilde-lysbordet. Dette gjenbruker hele den eksisterende, fungerende grovklipp-kommentarflyten uten endringer; kun *hvor kortet ligger* (inni riktig album fremfor kun galleriets toppnivå) er nytt.

Galleriets toppnivå-oversikt (`AlbumOverviewClient.tsx`) viser fortsatt album-omslag + eventuelle videoer uten `album_id`, uendret.

## Berørte filer

- `supabase/migrations/089_video_in_album.sql` (ny)
- `lib/actions/video-reviews.ts` — `createVideoReview` (ny param), `getGalleryVideos` (filter), ny `getAlbumVideos`
- `lib/actions/selection-albums.ts` / `lib/actions/selection-picks.ts` — admin- og kunde-datahenting for et album utvides til å inkludere videoer
- `app/admin/projects/[id]/selection/SelectionAdminClient.tsx` — video-opplastingsknapp + videokort i `AlbumDetailPanel`
- `app/s/[token]/[album]/AlbumGalleryClient.tsx` — videokort i kundens albumvisning

## Utenfor scope

- Ingen endring i selve video-avspilling/kommentar-siden (`VideoReviewClient`, `/s/[token]/video/[reviewId]`) — gjenbrukes uendret.
- Ingen mulighet til å flytte en video mellom album i etterkant (samme begrensning som i dag — opprettes direkte i riktig album).
- Ingen endring i bilde-lysbordet for å støtte video inline — video åpner fortsatt egen side, per bevisst valg.
- Ingen ekte video-thumbnail/poster-frame-generering — fortsatt samme play-ikon-plassholder som i dag.
