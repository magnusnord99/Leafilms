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

## Design-tokens bekreftet korrekt i bruk
- Primær accent: `#C49434` (gull) — brukt konsistent for labels, linjer og CTAer
- Bakgrunn-hierarki: `#0C0B09` → `#161410` → `#201D18` → `#2A261F` — respektert
- Typografi: Cormorant Garamond for display/serif, DM Sans for UI/labels — korrekt brukt
- Film grain overlay på `body::after` — allerede på plass
- Cinematic gradients på hero/deliverables/concept — allerede på plass

---

## Filer endret
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
