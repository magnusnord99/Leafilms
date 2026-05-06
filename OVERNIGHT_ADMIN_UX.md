# Overnight AI Review — Admin UX
**Team 2 — Dato: 2026-05-06 (overnight/ai-review)**

---

## Funn og tiltak

### 1. Visuell inkonsistens på tvers av admin-sider
**Problem:** `team/page.tsx`, `cases/page.tsx`, `ai-examples/page.tsx`, `videos/page.tsx` og `images/page.tsx` brukte det gamle UI-systemet (`Card`, `Heading`, `Text`, `bg-zinc-800`, `text-gray-400`) i stedet for det cinematiske mørke designsystemet (`#0C0B09`, `#161410`, `#E8E1D5`, Cormorant-overskrifter, DM Sans).

**Tiltak:** Alle disse sidene er omskrevet til å bruke de samme design-tokens og layout-mønstre som `dashboard/page.tsx`, `projects/page.tsx` og `customers/page.tsx`. Alle sider har nå:
- Konsistent mørk bakgrunn (`#0C0B09`)
- Cormorant-overskrift med dekorativ gull-strek
- Seksjonsetikett i DM Sans kapitéler
- Kortkomponenter med `#161410` / `#2A261F`-ramme

---

### 2. Loading states manglet konsistens
**Problem:** Eldre sider viste bare rå `<Text variant="body">Laster...</Text>` uten styling eller bakgrunn, noe som ga en hvit flash.

**Tiltak:** Alle loading-tilstander er nå like: `#0C0B09`-bakgrunn, gull-strek og tekst i DM Sans-kapitéler.

---

### 3. Feilmeldinger via `alert()` og native browser-dialogs
**Problem:** Slettefeil ble varslet med `alert('❌ Kunne ikke slette...')` — native browser-dialoger som er stygt og ugjennomsiktige.

**Tiltak:**
- Alle slettefeil vises nå som inline feil-banner øverst på siden (rød bakgrunn, kan lukkes).
- Slette-knapper disables under pågående sletting og viser `...` for å gi feedback.
- `alert()` fjernet fra: `team/page.tsx`, `cases/page.tsx`, `videos/page.tsx`, `images/page.tsx`, `admin/page.tsx`.

---

### 4. Manglende lukk-knapp (X) i modaler
**Problem:** `TeamPickerModal`, `CasePickerModal` og `CollagePresetPickerModal` hadde ingen X-knapp i headeren — bruker måtte treffe Avbryt-knappen nederst i modalen.

**Tiltak:** Alle tre modaler har fått en X-knapp øverst til høyre (SVG-ikon, `aria-label="Lukk"`).

---

### 5. `alert()` for maksgrense i picker-modaler
**Problem:** `ImagePickerModal` og `VideoPickerModal` brukte `alert()` til å si «Du kan maksimalt velge N bilder/videoer» — avbrøt fokus og var visuelt inkonsistent.

**Tiltak:** Grense-varselet vises nå som inline tekst under overskriften i modalen (gull-farge, forsvinner etter 2,5 sekunder).

---

### 6. Dashboard manglet oversiktlig statistikk
**Problem:** Dashboardet viste kun de siste 3 prosjektene og en kundeliste, men ingen rask oversikt over totaltall.

**Tiltak:** Lagt til en stats-rad med 4 klikkbare kort:
- Totalt antall prosjekter
- Publiserte prosjekter
- Totalt antall kunder
- Utkast

Kortene henter faktiske tall via to `count`-spørringer i Supabase (ikke avledet fra `.limit(3)`-datasettet).

---

### 7. Overflødig "Tilbake til admin"-knapp
**Problem:** `team`, `cases`, `ai-examples`, `videos` og `images`-sidene hadde en "← Tilbake til admin"-knapp, men disse sidene er allerede tilgjengelige direkte fra sidepanelet. Knappen skapte visuell støy og inkonsistens med sider som ikke hadde den.

**Tiltak:** Disse knappene er fjernet. Navigasjon skjer via sidemenyen (som er til stede på alle admin-sider).

---

### 8. `CollagePresetPickerModal` — lys preview-boks
**Problem:** Preview-collagen i `CollagePresetPickerModal` brukte `bg-zinc-100 / bg-gray-300` — lyse farger som stakk markant ut i det mørke UI-et.

**Tiltak:** Boks bruker nå `#0C0B09` med `#2A261F` placeholder-ruter — matcher designsystemet. Footer-border endret fra `border-zinc-200` til `border-zinc-800`.

---

### 9. Empty states manglet veiledende tekst
**Problem:** Tom-tilstander viste bare "Ingen X ennå" + en CTA-knapp, uten å forklare hva ressursene brukes til eller hvorfor man bør opprette dem.

**Tiltak:** Alle empty states har fått en sekundær forklaringstekst:
- Team: "Legg til team-medlemmer her for å gjenbruke dem på tvers av prosjekter."
- Cases: "Legg til tidligere arbeid her for å gjenbruke dem i prosjektpresentasjoner."
- AI Eksempler: "Legg til teksteksempler som AI bruker som referanse ved generering av mål og konsepter."
- Bilder/Videoer: Tilsvarende.

---

### 10. Tom-tilstand ved søk/filter viste feil melding
**Problem:** Søk/filter som ga null treff på videoer og bilder viste alltid "Ingen videoer/bilder ennå" og en CTA til opplasting — selv om det fantes innhold, bare ikke i valgt kategori.

**Tiltak:** Skilt mellom tomt bibliotek (`!isFiltered`) og tomt søkeresultat (`isFiltered`). Kun `!isFiltered` viser CTA og forklaring.

---

## Endrede filer

| Fil | Endring |
|---|---|
| `app/admin/page.tsx` | Stats-rad med 4 kort, konsistent loading, fjernet alert() på slett |
| `app/admin/team/page.tsx` | Full restyling til designsystem, inline feil-banner, loading-fix, fjernet backlink |
| `app/admin/cases/page.tsx` | Full restyling, inline feil-banner, loading-fix, fjernet backlink |
| `app/admin/ai-examples/page.tsx` | Full restyling til liste-layout, loading-fix, fjernet backlink |
| `app/admin/videos/page.tsx` | Restyling, inline feil, loading-fix, smart tom-tilstand, fjernet backlink |
| `app/admin/images/page.tsx` | Restyling, inline feil, loading-fix, smart tom-tilstand, fjernet backlink |
| `components/modals/TeamPickerModal.tsx` | X-knapp i header |
| `components/modals/CasePickerModal.tsx` | X-knapp i header |
| `components/modals/ImagePickerModal.tsx` | X-knapp i header, inline grense-varsel i stedet for alert() |
| `components/modals/VideoPickerModal.tsx` | Ny SVG X-knapp (erstattet ✕-tekst), inline grense-varsel |
| `components/modals/CollagePresetPickerModal.tsx` | Mørkt preview-panel, X-knapp, fikset footer-border |

---

## Funn og forbedringer

(Fylles ut av agenten)
