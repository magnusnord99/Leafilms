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
