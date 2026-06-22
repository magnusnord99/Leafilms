# Kundeseleksjon med album-støtte

**Dato:** 2026-06-22  
**Status:** Godkjent av Magnus

---

## Bakgrunn

Dagens kundeseleksjon (`/s/[token]`) er en flat bildegalleri med PIN-innlogging. Det mangler mulighet til å dele opp leveransen i album (f.eks. Headshots og Situasjonsbilder for et Medicura-oppdrag), og adminoppsettet er innebygd i prosjektsiden på en rotete måte.

**Ny funksjonalitet:**
- Album-struktur i galleriet — bilder tilhører et album, ikke galleriet direkte
- Felles bildesteller på tvers av alle album (ett samlet utvalg per galleri)
- Valgfri individuell delelenke per album med separat, uavhengig seleksjonssporing
- Dedikert admin-side per galleri + overordnet oversiktsside

---

## Brukerflyt — kunde

### Hoved-galleri (`/s/[galleryToken]`)

1. PIN-innlogging (uendret)
2. **Album-oversikt** — alle album vises som kort med navn, antall bilder, antall valgte. Et «Se alle valgte»-kort er alltid synlig. Total-teller (`X av Y valgt`) vises i headeren.
3. **Inn i album** (`/s/[galleryToken]/[albumSlug]`) — bildegrid, Velg/Valgt-knapp per bilde. Tilbake-pil til oversikten. Hoved-teller alltid synlig i toppen.
4. **Gjennomgang** (`/s/[galleryToken]/review`) — alle valgte bilder gruppert per album, total-oppsummering, bekreft og send inn.

### Individuell album-lenke (`/s/[albumToken]`)

- Direkte inn i bildegrid for det aktuelle albumet — ingen oversikt
- Eget PIN, eget måltall, separat seleksjonssporing (uavhengig av hoved-galleriet)
- Ruten `/s/[token]` sjekker `selection_galleries.token` først, deretter `selection_albums.album_token`

---

## Database — migrasjon `067_selection_albums.sql`

### Ny tabell: `selection_albums`

```sql
CREATE TABLE selection_albums (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id         UUID        NOT NULL REFERENCES selection_galleries(id) ON DELETE CASCADE,
  name               TEXT        NOT NULL,
  slug               TEXT        NOT NULL,
  sort_order         INTEGER     NOT NULL DEFAULT 0,
  album_token        TEXT        UNIQUE,          -- null = ingen individuell lenke
  album_pin_code     TEXT,
  album_target_count INTEGER,
  album_status       TEXT        NOT NULL DEFAULT 'open'
                     CHECK (album_status IN ('open', 'submitted')),
  album_submitted_at TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(gallery_id, slug)
);
```

### Endring: `selection_images`

```sql
ALTER TABLE selection_images
  ADD COLUMN album_id UUID REFERENCES selection_albums(id) ON DELETE CASCADE;
```

Eksisterende bilder uten `album_id` er gyldige. **Bakoverkompatibilitet:** gallerier uten album viser fortsatt den gamle flate grid-visningen til kunden (`albums.length === 0` → fallback). Admin ser bildene i en «Uten album»-seksjon øverst og kan flytte dem til album. `albumId` er nullable i `registerUploadedImages` — null betyr «uten album» (fallback til flat visning).

### Ny tabell: `selection_album_picks`

```sql
CREATE TABLE selection_album_picks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id    UUID        NOT NULL REFERENCES selection_albums(id) ON DELETE CASCADE,
  image_id    UUID        NOT NULL REFERENCES selection_images(id) ON DELETE CASCADE,
  selected    BOOLEAN     NOT NULL DEFAULT false,
  selected_at TIMESTAMPTZ,
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(album_id, image_id)
);
```

`selection_images.selected` / `selected_at` / `comment` brukes for **hoved-galleri-seleksjonen**.  
`selection_album_picks` brukes for **individuell album-seleksjon** (via `albumToken`).

### RLS

Alle tre tabeller: `authenticated` full access. Anonym tilgang styres via service-client og cookie-validering (uendret mønster).

---

## URL-struktur

| URL | Kontekst |
|-----|----------|
| `/s/[galleryToken]` | Album-oversikt for hoved-galleri |
| `/s/[galleryToken]/[albumSlug]` | Bilder i ett album (hoved-seleksjon) |
| `/s/[galleryToken]/review` | Gjennomgang før innsending |
| `/s/[albumToken]` | Individuell album-visning (album-picks-seleksjon) |

Routing-logikk i `/s/[token]/page.tsx`:
1. Sjekk `selection_galleries` — match → galleri-kontekst (vis oversikt)
2. Sjekk `selection_albums` — match → album-kontekst (vis enkelt-album direkte)
3. Ingen match → `notFound()`

---

## Admin-sider

### `/admin/projects/[id]/selection` (ny)

**Venstre sidebar:**
- Total-teller (valgt / mål på tvers av alle album)
- Hoved-galleri-lenke + PIN med kopieringsknapper
- Status-badge (åpent / innsendt / purged)
- Handlinger: Åpne for redigering, Slett bildefiler, Kopier filnavnliste

**Hoved-kolonne — album-liste:**
- Drag-rekkefølge (sort_order)
- Per album: navn (redigerbart inline), antall bilder, antall valgt, thumbnail-grid
- Dra-og-slipp bildeopplasting direkte til hvert album
- Toggle for individuell delelenke: av → genererer `album_token` + `album_pin_code`, viser lenke med kopieringsknapp
- Slett-knapp per album (krever bekreftelse, sletter bilder fra storage)
- «+ Legg til album»-knapp nederst

**Prosjektsiden** (`/admin/projects/[id]`):
- `SelectionGallery.tsx` erstattes av en liten lenke-knapp: «→ Administrer seleksjon»

### `/admin/selections` (ny)

Overordnet oversiktsside:
- Alle gallerier på tvers av prosjekter
- Kolonner: prosjektnavn, status, album-antall, valgt/mål, innsendt dato
- Klikk → direkte til `/admin/projects/[id]/selection`

---

## Server actions (`lib/actions/selections.ts`)

### Nye funksjoner

```ts
// Album-administrasjon (admin)
createAlbum(galleryId, name): Promise<SelectionAlbum>
updateAlbum(albumId, { name, sortOrder }): Promise<void>
deleteAlbum(albumId): Promise<void>        // sletter storage + DB
reorderAlbums(albumIds: string[]): Promise<void>
enableAlbumSharing(albumId, targetCount?): Promise<{ token, pinCode }>
disableAlbumSharing(albumId): Promise<void>

// Bilder — album-tilordning
assignImageToAlbum(imageId, albumId): Promise<void>

// Kunde — individuell album-picks
getAlbumForCustomer(token): Promise<{ album, images, picks } | null>
toggleAlbumImagePick(token, imageId, selected): Promise<void>
addAlbumImagePickComment(token, imageId, comment): Promise<void>
submitAlbumPicks(token): Promise<void>
```

### Endringer i eksisterende funksjoner

- `getGalleryForCustomer` — returnerer nå `albums: { album, images }[]` i stedet for flat `images[]`
- `getAdminGallery` — returnerer albums med bilder gruppert og per-album valgt-teller
- `registerUploadedImages` — tar nå valgfri `albumId` (null = uten album, bakoverkompatibelt)
- `getSelectedFilenames` — returnerer filnavn gruppert per album

---

## Komponenter

| Komponent | Plassering | Ansvar |
|-----------|-----------|--------|
| `SelectionAdminPage` | `app/admin/projects/[id]/selection/page.tsx` | Server component, laster data |
| `SelectionAdminClient` | samme mappe | Client component, all interaktivitet |
| `AlbumCard` | samme mappe | Enkelt-album i admin (thumbnail-grid, toggle, opplasting) |
| `AlbumOverviewClient` | `app/s/[token]/` | Kunde-oversikt med album-kort |
| `AlbumGalleryClient` | `app/s/[token]/[album]/` | Bildegrid for ett album |
| `ReviewClient` | `app/s/[token]/review/` | Gjennomgang før innsending |
| `SelectionsOverviewPage` | `app/admin/selections/page.tsx` | Overordnet oversikt |

Eksisterende `GalleryClient.tsx` og `PinClient.tsx` beholdes — `GalleryClient` refaktoreres til å rendre album-oversikt i stedet for flat grid.

---

## Hva som ikke endres

- PIN-mekanismen og cookie-validering er uendret
- Storage bucket `selections` er uendret
- Purge-funksjonalitet er uendret (sletter alle `storage_path` per galleri)
- Notification ved innsending er uendret
- Task-automasjon («Seleksjon til kunde» → done) er uendret

---

## Neste migrasjons-prefix

Neste er `067_` (bekreftet i CLAUDE.md).
