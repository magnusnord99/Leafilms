# Team 3 — Kundevisning / Prosjektbeskrivelse Design

**Branch:** overnight/ai-review
**Sist oppdatert:** 2026-05-06 (natt-review)

---

## Funn og forbedringer

### 1. QuoteSection — offentlig visning (KRITISK FIX)
**Problem:** Hele pristilbudet viste seg i `bg-gray-50` (hvit bakgrunn) med `text-dark/70` klasser — brøt fullstendig den cinematiske mørke estetikken.
**Løsning:** Full redesign av offentlig visning:
- Mørk bakgrunn `#161410` med `#2A261F` border
- Cormorant-skrift for totalsummen (stor, kursiv, elegant)
- Tabell-headers i uppercase/spaced DM Sans i gull-fargetone `#62594E`
- Kategoriserte metadata-felter i to-kolonne grid
- Aksepter-knapp som gullfarge CTA (`#C49434`) i stedet for generisk `<Button>` 
- Rabatt vises i gull (positiv tone) ikke rød

### 2. TeamMemberCard — komplett redesign
**Problem:** Kortene brukte `bg-background-widget-red` (lysegrå) med `text-dark` (krem) og `bg-white` profilbilder — passet ikke filmestetikk.
**Løsning:**
- Front side: mørk `#161410` bakgrunn, bilde fyller øverst 60% av kortet i full bredde
- Profilbilde: `brightness(0.92) saturate(0.85)` filter for filmisk tonality
- Navn i Cormorant kursiv, rolle i gull-uppercase DM Sans
- Bio i subtil `#9E9287` farge
- Diskret "Trykk" hint i hjørnet
- Bak side: `#201D18` med gull top-border `2px solid #C49434` — "aktiv" state
- Kontaktinfo diskret i bunnen av baksiden
- `min-h` økt fra `280px` → `320px` for bedre proporsjoner
- Fjernet `hover:scale-105` — for generisk, upassende for premium estetikk

### 3. FullImageSection — palettfix + vignette
**Problem:** Tom tilstand brukte `bg-gray-800`/`bg-gray-700` (nøytral grå), edit-knapp brukte `bg-white/90` med emoji.
**Løsning:**
- Min-høyde økt fra `50vh` → `65vh` (visningsinnhold) for mer dramatisk presentasjon
- Lagt til radial vignette-overlay for cinematisk dybde
- Tom tilstand bruker nå mørk bakgrunn + dashed border i tråd med resten av appen
- Edit-knapp matcher nå alle andre seksjoner

### 4. CasesSection — video/thumbnail containers
**Problem:** `bg-zinc-300 rounded-lg` (lys grå med avrundede hjørner) for video- og thumbnail-containere.
**Løsning:**
- Bakgrunn endret til `#0C0B09`
- Ingen avrundede hjørner (cinematisk, editorial stil)
- Fallback-ikon i stedet for emoji (`🎬`)
- Lagt til `color=C49434` parameter til Vimeo-embed for gull Vimeo-kontroller
- Filmtittel vises under hvert case i Cormorant kursiv

### 5. ContactSection — cinematisk display
**Problem:** Kontaktseksjonen var minimal — bare navn og e-post i liten Cormorant-tekst.
**Løsning:**
- Lagt til stor Cormorant display-header: *"La oss snakke."* (clamp 3rem–6.5rem)
- Kontaktinfo nå i DM Sans (`#9E9287`) istedenfor Cormorant
- Sentrert dekorativ horisontal linje som footer-ornament
- Mer dramatisk padding (py-20/32)

### 6. MoodboardSection — manglende seksjonsetiketten
**Problem:** Ingen seksjonslabel, teksten brukte `Text variant="lead"` (liten).
**Løsning:**
- Lagt til gull seksjonslabel `MOODBOARD` øverst
- Teksten nå i Cormorant display-stil (clamp 1.4rem–2rem, kursiv)

### 7. HeroSection — scroll-indikator animasjon
**Problem:** Scroll-indikatoren hadde `opacity: 0` inline med `animation: fade-in 2s ... forwards` men animation-keyframe for `fade-in` ikke synkronisert med `scroll-line-in` — linjen ble aldri synlig.
**Løsning:**
- Ny `@keyframes scroll-line-in` som animerer `scaleY` fra 0→1 (mer cinematisk)
- Lagt til prikk under linjen med forsinket fade-in
- Scroll-respons-transisjon endret fra `0.08s` → `0.15s` (mer graceful)

### 8. GoalSection — for rask scroll-animasjon
**Problem:** `transition: 0.1s ease-out` for inn-animasjonen — for snappy.
**Løsning:** Endret til `0.18s ease-out` for mer elegant innsliding.

### 9. ExampleWorkSection — tomme slots
**Problem:** Tomme bildeplasser viste `bg-gray-300`/`bg-gray-400` (rene grå).
**Løsning:** Endret til `#1A1713` i edit mode, `#0C0B09` i view mode.

### 10. PublicProjectClient — footer redesign
**Problem:** Footer hadde `bg-background-surface border-t border-border` med `Text variant="muted"` — ukoordinert.
**Løsning:** Minimalistisk centered ornament (linje — årstall/merke — linje) i svak `#38332A` farge.

### 11. Scroll-reveal animasjoner for alle seksjoner
**Ny funksjonalitet:** Lagt til CSS-klasse `.section-reveal` med IntersectionObserver i PublicProjectClient som aktiverer `.is-visible` når seksjoner entrer viewport. Seksjoner med egne scroll-animasjoner (concept, full_image) ekskluderes.

---

## Runde 2 — Dypere gjennomgang (2026-05-06)

### 12. HeroSection — feil clamp-verdi for mobil
**Problem:** `fontSize: 'clamp(5rem, 5vw, 5rem)'` — midtverdien 5vw på mobilskjerm (375px) gir ~19px, mye lavere enn 5rem-minimumsverdien. Clamp fungerte ikke som tiltenkt.
**Løsning:** Endret til `clamp(3.5rem, 8vw, 5rem)` — tre forskjellige verdier som faktisk skalerer.

### 13. DeliverableCard — visuell diskrepans med resten
**Problem:** Kortene brukte `rounded-lg` og `hover:scale-105` — begge upassende for editorial filmestetikk. Baksiden-textarea i edit mode brukte `bg-white/50 border border-dark/20`.
**Løsning:**
- Fjernet `rounded-lg` (ingen border-radius = cinematisk, kantete stil)
- Fjernet `hover:scale-105` (for generisk)
- Forsiden: eksplisitt `#1E1B16` bakgrunn, `1px solid #2A261F` border, `1px solid #38332A` topp
- Baksiden: `#2A261F` bakgrunn, `2px solid #C49434` topp-grense (konsistent med TeamMemberCard-pattern)
- Edit textarea: `#161410` bakgrunn, `#38332A` border, `#E8E1D5` tekst

### 14. DeliverableGrid — palette og mobile grid
**Problem:** "Legg til"-knapp brukte `border-gray-400`/`text-gray-500` (feil palett). Grid brukte `min-w-fit` som forårsaket horisontal overflow på mobil.
**Løsning:**
- Grid endret fra `min-w-fit` og `md:flex-nowrap` til `md:flex-wrap` — mobile korrekt
- Mobile grid: `grid-cols-2 sm:grid-cols-3` for mellomstore skjermer
- "Legg til"-knapp: dashed border i `#38332A`, hover → `#C49434`, DM Sans label
- Hint-tekst under kortene: DM Sans uppercase tracking i `#62594E`

### 15. ConceptSection — kropp-tekst i feil font
**Problem:** `Text variant="lead"` (DM Sans) for konseptbeskrivelsen — ikke cinematisk nok for et kreativt konsept.
**Løsning:** Erstattet med direkte `<p>` i Cormorant Garamond, `clamp(1.25rem, 2.2vw, 1.75rem)`, kursiv, linjehøyde 1.55.

### 16. DeliverablesSection — kropp-tekst i feil font
**Problem:** Samme som ConceptSection — `Text variant="lead"` for en seksjon som er svært visuell og dramatisk.
**Løsning:** Cormorant display-stil, same parametere som ConceptSection.

### 17. GoalSection — kropp-tekst i feil font
**Problem:** `Text variant="lead"` for mål-seksjonen som er side-by-side med et bredt bilde.
**Løsning:** Cormorant kursiv, clamp-skalering, fjernet ubrukt `Heading`-import.

### 18. not-found.tsx — helt off-brand
**Problem:** `bg-black font-bold text-white text-gray-400` — standard Next.js 404-side uten noen tilknytning til Leafilms-identiteten.
**Løsning:** Full brand-redesign:
- `#0C0B09` bakgrunn med film grain overlay
- Cormorant 404-tall: `clamp(6rem, 20vw, 10rem)`, kursiv, lett vekt
- Symmetrisk gull-ornament (linje — LEAFILMS — linje) øverst
- Melding i DM Sans, farge `#62594E`
- Vertikal `#38332A→transparent` dekorlinje
- "Tilbake"-lenke i uppercase DM Sans med hover → gull

### 19. SectionNavigation — forbedret panel
**Problem:** Ingen seksjonslabel inne i panelet, bare items. Close-knapp brukte `✕` unicode.
**Løsning:**
- Lagt til "SEKSJONER"-label øverst i panelet i svak `#38332A` farge
- Tynn skillelinje under header
- Close-knapp: `×` (bedre glyf)
- Hover-bakgrunn `#201D18` på hvert nav-item
- Hover-tekstfarge via Tailwind `group-hover:text-[#9E9287]`

### 20. ProductionScheduleSection — mobile padding og edit hover
**Problem:** `px-8` på mobile gir liten plass til scroll-hint og border. Edit hover-klasse brukte `hover:outline-dark/20` og `rounded`.
**Løsning:**
- Ytre seksjon: `px-4 sm:px-8 md:px-16` gradert padding
- Edit hover: `hover:outline-[#38332A]` uten `rounded` (cinematisk kanter)

### 21. TimelineSection — safe-area og padding-mobil
**Problem:** Sticky container respekterte ikke iPhone notch/safe-area. Section label hadde `px-8` fast.
**Løsning:**
- `paddingTop: 'env(safe-area-inset-top)'` på sticky container
- Section label: `px-6 md:px-16` + `mb-8 md:mb-10`

---

## Runde 3 — Finpuss og gjenstående (2026-05-07)

### 22. ProductionScheduleSection — manglende seksjonsheader og dobbel-padding
**Problem:** Tabellene startet uten noen overordnet seksjonstittel — man skjønte ikke kontekst med en gang. Padding var `py-12 md:py-20` (for lav). "Legg til rad"-knapp brukte `rounded` og `text-dark opacity-50 border border-dark/30`.
**Løsning:**
- Lagt til stor Cormorant-header over de to tabellene: kursiv, clamp(2.5rem–4rem), label `PRODUKSJONSPLAN`
- Padding økt til `py-16 md:py-24` (konsistent med resten)
- "Legg til rad"-knapp: DM Sans uppercase, dashed `#38332A` border, ingen rounded
- Fjernet ytre `max-w-7xl mx-auto` fra outer wrapper (ProductionScheduleSection håndterer dette selv) → unngår dobbel-containment

### 23. TimelineSection — for flat, ingen narrativ ramme
**Problem:** Kortene hang fritt uten noen overordnet dramaturgi. Ingen intro-tekst ga kontekst. Progress-indikator var bare tre enkle dots uten sammenheng.
**Løsning:**
- Lagt til Cormorant display-overskrift: *"Fra idé til ferdig produksjon"* — redigerbar, clamp(2.25rem–3.75rem), kursiv — vises over kortene og drifter sakte bort under scroll
- Overskriften er contentEditable i editMode (`sectionHeading`-key)
- Progress-indikator redesignet: en sammenkoblet linje (`#2A261F` track, `#C49434` fill) med prikk-markører og gull glow på aktiv. Fyller seg progressivt via `width: (activeIndex / (n-1)) * 100%`
- Aktiv dato vises under progresslinjen med tynnere tracking

### 24. PublicProjectClient — timeline i section-reveal, dobbel padding
**Problem 1:** `timeline` ble ikke lagt til i `noReveal`-listen → seksjonen startet med `opacity: 0` fra `.section-reveal`, mens den sticky scroll-animasjonen aldri kaller `.is-visible` (siden IntersectionObserver ser `height: 280vh`-containeren, ikke det sticky innholdet). Timeline var usynlig.
**Løsning:** Lagt til `section.type === 'timeline'` i `noReveal`.

**Problem 2:** Seksjoner som `cases`, `moodboard`, `team`, `quote`, `contact`, `production_schedule` har alle sin egen interne `py-*` padding. Den ytre `<section>` wrapperen brukte `py-section` (6rem) i tillegg → dobbelt så mye vertical white space som ønsket.
**Løsning:** Introdusert `selfPadded`-flagg. Slike seksjoner får `px-0` (uten py) fra ytre wrapper. Inner-div for disse seksjonene endret fra `max-w-7xl mx-auto` til `w-full`.

### 25. Print/PDF-vennlighet — @media print lagt til
**Problem:** Ingen print-spesifikke stiler. Siden kunder kan ønske å skrive ut tilbudet eller lagre det som PDF, bør innholdet være lesbart på hvit bakgrunn.
**Løsning:** Lagt til `@media print` i `globals.css`:
- Hvit bakgrunn, sort tekst
- Film grain overlay skjult (`body::after { display: none }`)
- Tabeller: `border-collapse`, tydelige `1px solid #ddd` rammer, hvite rader
- `.section-reveal` reset til `opacity: 1, transform: none` (ikke usynlig på utskrift)
- Sticky navigasjon og `<footer>` skjult
- `page-break-inside: avoid` på kort og overskrifter
- Knapper/interaktive elementer skjules

### 26. Meta-tags / OG-tags for deling
**Problem:** `app/p/[token]/page.tsx` hadde ingen `generateMetadata` → blank tittel og ingen preview ved deling på LinkedIn/e-post.
**Løsning:** Lagt til `generateMetadata` server-funksjon:
- Henter prosjektnavn og beskrivelse fra DB for token
- `og:title`, `og:description`, `og:url`, `og:image` (`/og-default.jpg` fallback)
- Twitter Card: `summary_large_image`
- `robots: { index: false, follow: false }` — kundesider er private, skal ikke indekseres
- Graceful fallback til `"Leafilms"` hvis token er ugyldig

---

## Design-tokens bekreftet korrekt i bruk
- Primær accent: `#C49434` (gull) — brukt konsistent for labels, linjer og CTAer
- Bakgrunn-hierarki: `#0C0B09` → `#161410` → `#201D18` → `#2A261F` — respektert
- Typografi: Cormorant Garamond for display/serif, DM Sans for UI/labels — korrekt brukt
- Film grain overlay på `body::after` — allerede på plass
- Cinematic gradients på hero/deliverables/concept — allerede på plass

---

## Filer endret

### Runde 1
- `components/sections/QuoteSection.tsx` — full redesign av offentlig visning
- `components/sections/TeamMemberCard.tsx` — komplett redesign av kort-layout
- `components/sections/TeamSection.tsx` — min-h justert
- `components/sections/CasesSection.tsx` — video/thumbnail container-fix
- `components/sections/FullImageSection.tsx` — vignette + palettfix
- `components/sections/ContactSection.tsx` — cinematisk display-header
- `components/sections/MoodboardSection.tsx` — seksjonslabel + display-typografi
- `components/sections/HeroSection.tsx` — scroll-indikator animasjon
- `components/sections/GoalSection.tsx` — transisjon-timing
- `components/sections/ExampleWorkSection.tsx` — tomme slots palettfix
- `app/p/[token]/PublicProjectClient.tsx` — footer, scroll-reveal IO
- `app/globals.css` — `scroll-line-in` og `.section-reveal` keyframes/klasser

### Runde 3
- `components/sections/ProductionScheduleSection.tsx` — seksjonsheader, økt padding, palette-korrekte knapper
- `components/sections/TimelineSection.tsx` — Cormorant display-heading, redesignet progress-indikator med linje
- `app/p/[token]/PublicProjectClient.tsx` — timeline i noReveal, selfPadded-logikk for konsistent spacing
- `app/p/[token]/page.tsx` — generateMetadata med OG-tags og Twitter Card
- `app/globals.css` — @media print styles for PDF/utskrift

### Runde 2
- `components/sections/HeroSection.tsx` — clamp-fix for mobil tittelstørrelse
- `components/sections/ConceptSection.tsx` — Cormorant display-tekst, fjernet `Heading`-import
- `components/sections/DeliverablesSection.tsx` — Cormorant display-tekst, ryddet imports
- `components/sections/GoalSection.tsx` — Cormorant display-tekst, fjernet `Heading`-import
- `components/sections/TimelineSection.tsx` — safe-area padding, mobile label-padding
- `components/sections/ProductionScheduleSection.tsx` — gradert mobile padding, edit hover
- `components/project/DeliverableCard.tsx` — cinematisk redesign (border, ingen rounded/scale)
- `components/project/DeliverableGrid.tsx` — grid mobile fix, palette-korrekte knapper
- `components/project/SectionNavigation.tsx` — SEKSJONER-label, hover-bakgrunn, forbedret close
- `app/p/[token]/not-found.tsx` — full on-brand redesign
