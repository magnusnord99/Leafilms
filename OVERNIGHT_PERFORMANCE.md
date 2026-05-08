# Team 1 — Ytelse & Optimalisering

**Branch:** overnight/ai-review
**Dato/tid:** 2026-05-06 (overnight run)

---

## Funn

### 1. N+1 databasespørringer i `app/p/[token]/page.tsx`
Den offentlige prosjektsiden kjørte én Supabase-spørring per seksjon (potensielt 10–15 seksjoner) for å hente bilder og videoer — dvs. opptil 30 separatespørringer. I tillegg ble det kjørt en ekstra "debug"-spørring som hentet alle seksjoner (inkludert usynlige) og en `view_count`-spørring uansett. Dette er den tyngste ytelsesfeilen i hele appen.

### 2. Duplikat `useEffect` i `app/admin/images/page.tsx`
To `useEffect`-hooks trigget `fetchImages()` ved mount: én for `[]` og én for `[selectedCategory, selectedSubcategory, searchQuery]`. Dette ga dobbelt DB-kall ved første sidebesøk.

### 3. Tomt `useEffect` i `TeamSection.tsx`
En `useEffect` med tom body (kommentar "Debug log removed") registrerte en effekt med deps `[section.id, sectionImages, galleryImages]` uten å gjøre noe — unødvendig re-render-trigger og linting-støy.

### 4. Overdreven console.log-spam i produksjon
`useProjectAnalytics.ts` logget svært detaljert info (IntersectionObserver-callbacks, fallback-teller, debug-sjekker med `setTimeout`) på hvert scroll-event, hvert 3. sekund, og ved hvert send. `app/api/analytics/track/route.ts` logget rådata inkludert alle seksjonstider til server-stdout. Dette øker I/O-kost og gjør loggene ubrukelige.

### 5. Analytics send-intervall for aggressivt
Hook-et sendte analyticsdata hvert 10. sekund (redusert fra 30s tidligere, men siden endret tilbake til 10s "for å unngå tap"). Hvert kall krever autentisering, `project_shares`-validering og `project_analytics` upsert mot Supabase.

### 6. Manglende image-optimalisering i `next.config.ts`
Ingen `images`-konfigurasjon — Next.js Image Optimization var ikke konfigurert for Supabase Storage-domenet. AVIF/WebP ble ikke aktivert.

### 7. `install` og `npm` i `dependencies`
De to pakkene `install@^0.13.0` og `npm@^11.6.2` lå feilaktig i runtime-avhengighetene. De skulle ikke vært der. `@types/pdfkit` lå også i `dependencies` i stedet for `devDependencies`.

### 8. Inline-objekter som prop-verdier i `PublicProjectClient.tsx`
Noop-funksjoner og tomme objekter (`imagePosition={{}}`, `sectionImageData={{}}`) ble opprettet på nytt ved hvert render, som tvinger child-komponenter til å re-rende selv om de er memoizert.

### 9. Inline `.filter().sort()` i JSX-render
Seksjons-listen ble filtrert og sortert inne i JSX på hvert render av komponenten.

### 10. Scroll-fallback-intervall i analytics-hook
Et `setInterval(checkVisibleSections, 3000)` kjørte hvert 3. sekund i tillegg til scroll-listener og IntersectionObserver — tre overlappende mekanismer for samme oppgave.

---

## Endringer gjort

### `next.config.ts`
- Lagt til `compress: true` (gzip-komprimering av respons)
- Lagt til `images`-konfigurasjon med AVIF/WebP-formater, `remotePatterns` for Supabase Storage, og optimale `deviceSizes`/`imageSizes`

### `package.json`
- Fjernet `install@^0.13.0` og `npm@^11.6.2` fra `dependencies` (var feilplassert, øker bundle-størrelse)
- Flyttet `@types/pdfkit` fra `dependencies` til `devDependencies`

### `app/p/[token]/page.tsx`
- Fjernet debug-spørringen som hentet alle seksjoner (inkl. usynlige) — ekstra DB-kall uten bruksverdi
- Fjernet 10–30 N+1 løkke-spørringer: erstattet med 2 parallelle `Promise.all`-spørringer for `section_images` og `section_video_library`, etterfulgt av 2 batch-`in`-spørringer for `images` og `video_library`. Totalt DB-kall for bilder/videoer: fra O(n*2) til O(4) uavhengig av antall seksjoner.
- Fjernet verbose `console.log`-spam som logget bilde-IDer, filstier og sorteringsresultater per seksjon

### `app/api/analytics/track/route.ts`
- Fjernet alle `console.log`-kall for request-payload, session merge-statistikk og success-meldinger
- Beholdt kun `console.error` for faktiske feil

### `hooks/useProjectAnalytics.ts`
- Fjernet all `console.log`-spam: IntersectionObserver-callbacks, fallback-teller, 3-sekunders debug-sjekk, initial tracking-log, unload-log
- Fjernet `setInterval(checkVisibleSections, 3000)` fallback-intervallet (IntersectionObserver + scroll-listener er tilstrekkelig)
- Økt send-intervall fra 10 sekunder tilbake til 30 sekunder
- Økt initial send-delay fra 3 sekunder til 5 sekunder

### `components/sections/TeamSection.tsx`
- Fjernet tomt `useEffect` (kropp var bare en kommentar) + tilhørende `useEffect`-import

### `app/p/[token]/PublicProjectClient.tsx`
- Endret `getSectionTitle` fra inline-funksjon til `useCallback` (stabil referanse)
- Endret `getBackgroundStyle` fra inline-funksjon til `useCallback` med riktige deps
- Endret noop-funksjoner til `useCallback(() => {}, [])` — stabile referanser
- Lagt til `emptyImagePosition` og `emptyRecord` som `useMemo`-stabiliserte tomme objekter, brukt i stedet for `{}` inline i JSX
- Memoizert `heroSection`, `sortedNonHeroSections`, `selectedTeamMemberIds`, `selectedCaseIds` med `useMemo`
- Erstattet inline `.filter().sort()` i JSX med forhåndsberegnet `sortedNonHeroSections`

---

## Runde 2 — Funn

### 11. Duplikat `useEffect` i `ImagePickerModal` og `VideoPickerModal`
Begge modale komponentene hadde to overlappende `useEffect`-hooks: én for `[isOpen, selectedIds]` (reset + fetch) og én for `[selectedCategory, searchQuery]` (re-fetch). Dette ga dobbelt DB-kall ved åpning, da `isOpen: true` utløste begge. Samme feil som ble fikset i `admin/images/page.tsx` i runde 1.

### 12. N+1 i `CollagePresetPickerModal`
`loadPresets()` kjørte én Supabase-spørring per preset for å hente bilder via `collage_preset_images`. Skalerer lineært med antall presets.

### 13. N+1 i `app/admin/customers/[id]/projects/page.tsx`
`fetchData()` kjørte én `quotes`-spørring og én `contracts`-spørring per prosjekt i en `Promise.all`-løkke. For en kunde med 5 prosjekter = 10 DB-kall.

### 14. Sekvensielle count-spørringer + separat `useEffect`-cascade i `app/admin/page.tsx`
Dashboard-siden hadde to sekvensielle count-spørringer etterfulgt av to separate fetch-kall (prosjekter, kunder). I tillegg trigget en `useEffect([customers])` en ekstra `fetchProjectCounts()`-funksjon etter render, noe som ga en render-cascade.

### 15. `select('*')` på bredt brukte lister
`admin/images/page.tsx`, `admin/projects/page.tsx` og modaler hentet alle kolonner fra `images`, `projects` og `video_library`, selv om de kun viste noen få felter (tittel, kategori, fil-sti).

### 16. Resterende `console.log`-spam
- `app/admin/projects/[id]/edit/page.tsx`: 2 debug-logger for "AI-generering refresh"
- `app/admin/projects/[id]/quote-analytics/page.tsx`: 2 debug-logger med full analytics-payload
- `app/admin/videos/new/page.tsx`: upload-start og upload-success logger

### 17. `any`-typer i `EditProjectModals` og `edit/page.tsx`
`allCases: any[]` og `allTeamMembers: any[]` i `EditProjectModalsProps` — typeinformasjon kastes bort, runtime-feil maskeres. `collageImages`-state i `edit/page.tsx` hadde `pos1: any | null` (5 ganger).

### 18. Inline `.filter().sort()` i `edit/page.tsx`
Admin-editoren hadde samme mønster som `PublicProjectClient.tsx` fikset i runde 1: tre inline seksjonsfilter/sorter i JSX-render pluss `visibleSections` re-beregnet inne i hvert `.map()`-kall.

### 19. Manglende HTTP cache-headers i `next.config.ts`
Next.js sendte ingen eksplisitte `Cache-Control`-headers for statiske assets eller API-ruter. Nettlesere og CDN-er brukte da default-verdier (oftest `no-cache`).

---

## Endringer gjort (runde 2)

### `components/modals/ImagePickerModal.tsx`
- Flettet de to `useEffect`-hooks til én: `[isOpen, selectedCategory, searchQuery]` — fetch kun når modal er åpen
- Smalnet `select('*')` til `select('id, filename, file_path, title, category, subcategory, tags')`

### `components/modals/VideoPickerModal.tsx`
- Flettet de to `useEffect`-hooks til én: `[isOpen, selectedCategory, searchQuery]`
- Smalnet `select('*')` til `select('id, filename, file_path, title, category, thumbnail_path, duration')`

### `components/modals/CollagePresetPickerModal.tsx`
- Erstattet N+1-løkke med ett enkelt Supabase-kall med nested join: `collage_presets` med `collage_preset_images(position, images(id, filename, file_path, title))`
- Totalt antall DB-kall ved åpning: fra O(n+1) til O(1)

### `app/admin/customers/[id]/projects/page.tsx`
- Erstattet per-prosjekt `Promise.all`-løkke for quotes og contracts med to parallelle batch-spørringer: `.in('project_id', projectIds)` for `quotes` og `contracts`
- Totalt DB-kall: fra O(2n + 2) til O(4) uavhengig av antall prosjekter

### `app/admin/page.tsx`
- Slått sammen fire sekvensielle DB-kall (2×count, prosjekter, kunder) til ett `Promise.all` med fire parallelle kall
- Fjernet separat `fetchProjectCounts()`-funksjon og `useEffect([customers])`-cascade — prosjekttelling gjøres nå i samme `fetchData()`-runde
- Smalnet `select('*')` for projects til kun nødvendige felter
- Fjernet ubrukt `useRouter`-import og `router`-variabel

### `app/admin/projects/page.tsx`
- Smalnet `select('*')` til `select('id, title, status, client_name, updated_at, parent_project_id, version_number')`

### `app/admin/images/page.tsx`
- Smalnet `select('*')` til `select('id, filename, file_path, title, category, subcategory, tags')`

### `app/admin/projects/[id]/edit/page.tsx`
- Fjernet 2 `console.log`-kall for AI-generering refresh
- Erstattet `pos1: any | null` (×5) i `collageImages`-state med `pos1: Image | null`
- La til `useMemo` for `sortedNonHeroSections`, `visibleNonHeroCount` og `hiddenNonHeroSections`
- Erstattet tre inline `.filter()/.sort()` i JSX med de memoizerte verdiene

### `app/admin/projects/[id]/quote-analytics/page.tsx`
- Fjernet 2 `console.log`-kall med full analytics-payload

### `app/admin/videos/new/page.tsx`
- Fjernet upload-start og upload-success `console.log`
- Skalert ned upload-error logging til én `console.error`-linje

### `components/project/EditProjectModals.tsx`
- Erstattet `allCases: any[]` med `allCases: CaseStudy[]`
- Erstattet `allTeamMembers: any[]` med `allTeamMembers: TeamMember[]`
- Erstattet `images: any` i `onPresetSelect`-prop med typet `CollageImages`-type

### `next.config.ts`
- Lagt til `headers()`-konfigurasjon:
  - `/_next/static/**`: `Cache-Control: public, max-age=31536000, immutable` (1 år)
  - `/_next/image`: `Cache-Control: public, max-age=86400, stale-while-revalidate=604800`
  - `/api/**`: `Cache-Control: no-store` (API-ruter skal aldri caches)
