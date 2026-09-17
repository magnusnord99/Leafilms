# Lightmode for admin-verktøyet

**Dato:** 2026-09-17
**Status:** Godkjent av Magnus (verbalt, per spørsmål-runde i brainstorming-økt)

## Bakgrunn

Admin-verktøyet (`/admin/*`) har i dag kun ett fargetema — mørkt lilla
(`lib/admin-theme.ts`, `bg: #181920`, `accent: #7C5CFC`). Magnus vil ha
mulighet for lysmodus. Kundevendte sider (`/p`, `/d`, `/s` m.fl., egen
cinematisk mørk palett i `lib/client-theme.ts`) er **eksplisitt utenfor
scope** — de beholder sin bevisste "ingen generisk AI-estetikk"-branding
uendret (se `CLAUDE.md`).

## Nåsituasjon (funn)

- All admin-fargelegging skjer via inline `style={{ color: C.text }}`
  der `C` er et objekt med **harde hex-strenger**. Ingen admin-side
  bruker Tailwind-klassene (`admin-bg`, `admin-surface` osv.) som
  faktisk er definert i `globals.css` — 0 treff i kodebasen.
- 69 av 117 admin-`.tsx`-filer importerer `C` fra
  `lib/admin-theme.ts`.
- **30 filer har sin egen lokale kopi** av `const C = { ... }` med
  harde hex-verdier, i stedet for å importere den delte modulen
  (eksisterende teknisk gjeld, ikke noe lightmode skaper).
- Resten av filene (~90 av 117 har minst én hex-farge et sted) bruker
  i tillegg ad-hoc hex utenfor `C`, typisk:
  - Nøytrale gråtoner som antar mørk bakgrunn (hover-border
    `#3D3D4E`, ymse overflate-farger).
  - Mettede status/aksentfarger for pipeline-stadier og badges
    (`#F0A500`, `#4A9AC4`, grønn/rød for suksess/feil).
- Ingen eksisterende dark/light-mode-infrastruktur i kodebasen
  (`prefers-color-scheme`, `ThemeProvider`, `useTheme` — 0 treff).

## Mål

1. Lysmodus for hele `/admin/*` — samme lilla merkeidentitet, lys
   bakgrunn.
2. Standard: følg OS-innstilling (`prefers-color-scheme`).
3. Manuell bryter i admin-headeren som overstyrer og huskes.
4. Ikke-mål: kundevendte sider, database-synk av valget på tvers av
   enheter, pixel-perfect gjennomgang av hver eneste hardkodede
   aksentfarge.

## Arkitektur

### 1. CSS-variabler for admin-paletten

Nye CSS custom properties i `app/globals.css`, definert under en egen
klasse (**ikke** på `:root` eller `<html>` — se "Isolasjon" under):

```css
.admin-theme-root {
  --admin-bg: #181920;
  --admin-sidebar: #111116;
  --admin-surface: #21212D;
  --admin-surface2: #2A2A38;
  --admin-border: #3C3C52;
  --admin-text: #EEEEF2;
  --admin-text2: #B4B4CC;
  --admin-text3: #8484A0;
  --admin-accent: #7C5CFC;
  --admin-accent-bg: rgba(124, 92, 252, 0.10);
  --admin-danger: #E05555;
  --admin-success: #4CAF7D;
  --admin-warning: #D4863A;
  --admin-hover-border: #3D3D4E;
}

.admin-theme-root[data-theme='light'] {
  --admin-bg: #F1F1F5;
  --admin-sidebar: #FFFFFF;
  --admin-surface: #FFFFFF;
  --admin-surface2: #F5F5FA;
  --admin-border: #E1E1EA;
  --admin-text: #1D1D26;
  --admin-text2: #55556B;
  --admin-text3: #74748C;
  --admin-accent: #7C5CFC;
  --admin-accent-bg: rgba(124, 92, 252, 0.08);
  --admin-danger: #C93E3E;
  --admin-success: #2F8F5B;
  --admin-warning: #B4691E;
  --admin-hover-border: #D5D5E0;
}
```

Eksakte lys-fargeverdier justeres visuelt under implementasjon
(kontrast-sjekk), men strukturen står fast.

### 2. `lib/admin-theme.ts` peker på variablene

```ts
export const C = {
  bg:       'var(--admin-bg)',
  sidebar:  'var(--admin-sidebar)',
  surface:  'var(--admin-surface)',
  surface2: 'var(--admin-surface2)',
  border:   'var(--admin-border)',
  text:     'var(--admin-text)',
  text2:    'var(--admin-text2)',
  text3:    'var(--admin-text3)',
  accent:   'var(--admin-accent)',
  accentBg: 'var(--admin-accent-bg)',
  danger:   'var(--admin-danger)',
  success:  'var(--admin-success)',
  warning:  'var(--admin-warning)',
}
```

`success`/`warning` legges til her fordi noen av de 30 lokale kopiene
bruker disse nøklene — de unioneres inn i den delte modulen før
duplikatene fjernes, slik at ingen fil mister en nøkkel den er
avhengig av.

De **69 filene som allerede importerer `C`** trenger ingen endring i
det hele tatt — de blir theme-aware automatisk.

### 3. Rydde de 30 lokale `const C`-kopiene

Hver av de 30 filene: fjern den lokale `const C = { ... }`-blokken,
legg til `import { C } from '@/lib/admin-theme'`. Rent mekanisk,
verifiseres med `tsc` etterpå at ingen fil brukte en nøkkel som
mangler i den delte modulen.

### 4. Theme-provider og toggle

Ny fil `lib/admin-theme-provider.tsx` (client component):

- `AdminThemeProvider` — leser `localStorage['leafilms-admin-theme']`
  (`'light' | 'dark'` eller fraværende). Hvis fraværende, bruker
  `window.matchMedia('(prefers-color-scheme: light)')` og lytter på
  endringer (kun så lenge brukeren ikke har satt et eksplisitt valg).
- `useAdminTheme()` — hook som gir `{ theme, setTheme }`.
- Setter `data-theme` på wrapper-diven (se pkt. 5), ikke på `<html>`.
- Liten `AdminThemeToggle`-komponent (sol/måne-ikon) som kalles fra
  headeren.

### 5. Isolasjon — hvorfor ikke `<html>`

`app/admin/layout.tsx` pakker allerede alt admin-innhold i en
container. Denne containeren får klassen `admin-theme-root` og
attributtet `data-theme`. Dette holder hele mekanismen 100% innenfor
admin — rot-layout (`app/layout.tsx`) og kundevendte sider berøres
ikke i det hele tatt, uansett hva noen senere gjør med `:root`.

Kjent begrensning: fordi `app/admin/layout.tsx` er en client component
og attributtet settes i en effekt, kan det oppstå et kort glimt av
mørk modus før lys modus slår inn ved første last (kun for brukere som
har lys valgt/OS-lys). Akseptabelt for et internt, innlogget verktøy —
ikke en offentlig side der første inntrykk teller.

### 6. Toggle-plassering

Sol/måne-knapp i admin-headeren, ved siden av `NotificationBell` /
profil-menyen i `app/admin/layout.tsx`.

## Håndtering av ad-hoc hex utenfor `C` (~90 filer)

- **Nøytrale gråtoner som antar mørk bakgrunn** (hover-border
  `#3D3D4E` er hovedmønsteret funnet så langt) — grep opp alle
  forekomster av disse spesifikke verdiene og erstatt med
  `var(--admin-hover-border)` (lagt til i tokenlisten over). Andre
  tilsvarende ad-hoc-mørke-forutsetninger fikses samme vei når de
  dukker opp under implementasjon.
- **Mettede status-/aksentfarger** (pipeline-stadier, badges) — la stå
  som literal hex. God kontrast mot både mørk og lys bakgrunn i
  praksis; ingen visuell gevinst ved å bytte dem ut, kun risiko.

## Testing

- `tsc --noEmit` etter dedup av de 30 lokale `C`-kopiene.
- Visuell gjennomgang i Chrome (dev-server) av et representativt
  utvalg sider i begge temaer: dashboard (`/admin`), en liste
  (`/admin/projects`), en kanban/board-visning, en chat-panel-side, et
  skjema. Siden dette er 117 filer er det ikke praktisk mulig å
  klikke gjennom alle — resten spot-sjekkes av Magnus etter deploy.
- Ingen nye databasemigrasjoner, ingen RLS-endringer.

## Rollout

Ingen feature-flag — dette er et rent frontend-bytte som er
bakoverkompatibelt (default forblir visuelt identisk med dagens mørke
tema for brukere med mørk OS-innstilling). Deployes som vanlig via
`deploy.sh` når implementasjonen er ferdig og visuelt verifisert.
