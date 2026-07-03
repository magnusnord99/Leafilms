# ProjectChat: redesign fra flytende boble til dokket slide-out-panel

**Status:** Godkjent av Magnus i samtale 2026-07-03, rett etter at
task-chat-everywhere-branchen ble fullført. Kort, avgrenset design —
ingen ny funksjonalitet, kun visuell/posisjonell omskriving av én
eksisterende komponent.

## Bakgrunn

`components/project/ProjectChat.tsx` bruker fortsatt en eldre gull/varm
fargepalett (`#C49434`-aksent, `#0E0D0B`-bakgrunn) som ikke matcher resten
av admin-UI-et, som i løpet av kvelden konsekvent har brukt en lilla mørk
palett (`#7C5CFC`-aksent, `#181920`-bakgrunn — se `TaskChat.tsx`,
`TaskChatToggle.tsx`, postprod/preprod/hub-sidene). Magnus pekte også på at
komponenten "dukker opp et litt random sted" — den er i dag en flytende
sirkel-knapp nederst til høyre som popper opp et lite panel oppå
sideinnholdet, løsrevet fra resten av siden.

## Mål

- Samme lilla admin-palett som `TaskChat`/`TaskChatToggle`.
- Forutsigbar, fast plassering i stedet for en flytende overlay-boble i
  hjørnet.
- All eksisterende funksjonalitet (hente/sende meldinger, realtime,
  ulest-telling, @mentions) beholdes uendret — dette er en ren
  visuell/posisjonell redesign, ikke en funksjonell omskriving.
- Ingen endring i hvor `ProjectChat` er montert (prosjekt-hub og
  `/edit`-siden, som i dag) — ikke en utvidelse til flere sider.

## Design

### Trigger-knapp

Byttes fra `position: fixed, bottom: 24, right: 24` (flytende sirkel i
hjørnet, overlapper innhold uansett scroll-posisjon) til en liten,
fast-plassert knapp øverst til høyre på selve siden, rett under den
globale sticky toppbaren (48px høy, definert i `app/admin/layout.tsx`).
Ikke inni den delte toppbaren selv — det ville krevd å tre
prosjekt-kontekst gjennom `layout.tsx`, som pakker samtlige admin-sider
(leads, oppgaver, markedsanalyse, ingen av dem har et prosjekt i scope).
Holder endringen avgrenset til `ProjectChat.tsx` og dens eksisterende
monteringspunkter.

Knappen beholder ulest-badge-mønsteret fra dagens implementasjon, men i
lilla palett.

### Panel

Byttes fra et lite popup-panel (`bottom: 84, right: 16, left: 16`,
maxHeight 480) til et fullhøyde slide-in-panel fra høyre kant:
- `position: fixed`, `top: 48` (rett under global toppbar), `right: 0`,
  `height: calc(100vh - 48px)`, `width: 360px` (full bredde på mobil,
  samme breakpoint-logikk som i dag).
- Glir inn med en enkel transform-transition (`translateX`), ikke en
  brå vis/skjul.
- Semi-transparent backdrop bak panelet som lukker det ved klikk —
  samme interaksjonsfamilie som andre overlays i appen (modaler), bare
  forankret til høyre kant i stedet for sentrert.
- Innhold i panelet (header, meldingsliste, mention-highlighting,
  input) redesignes visuelt til lilla palett, men strukturen og all
  logikk (fetch mot `/api/projects/[id]/messages`, `sendMessage`,
  realtime-subscription, `extractMentionIds`/`splitMentionSegments`,
  `MentionTextInput`) beholdes identisk — kun `style`-objektene endres.

### Ikke i denne endringen

- Ingen nye sider får `ProjectChat` montert.
- Ingen endring i `app/admin/layout.tsx` eller andre delte
  layout-filer.
- Ingen endring i API-ruten `app/api/projects/[id]/messages/route.ts`.
- Ingen "push content"-layout (panelet overlayer, det trykker ikke
  sideinnholdet til side) — enklere og lavere risiko enn en ekte
  to-kolonne-layoutendring.

## Testing

Ingen automatiserte tester i dette repoet. Verifiseres med
`npx tsc --noEmit` og manuell gjennomgang av kode/diff — samme
tilnærming som resten av kveldens arbeid. Anbefaler at Magnus selv
klikker gjennom (åpne/lukke panelet, sende en melding, bekrefte
ulest-badge) siden ingen agent har hatt nettleser-tilgang i natt.
