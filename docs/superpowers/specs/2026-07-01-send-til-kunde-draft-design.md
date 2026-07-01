# Send til kunde — AI-utkast med lenke

## Problem

Når pitch, tilbud og kontrakt er satt opp og man trykker "send til kunde", skal en automatisk
melding genereres som et redigerbart utkast med lenken til `/p/{token}` pent skrevet inn i
teksten. I dag skjer ikke dette på noen av de to stedene i appen som tilbyr en send-knapp:

1. **`TilbudStepper`** (`app/admin/projects/[id]/page.tsx`) — knappen "Send e-post til kunde →"
   kaller `sendTilbudToKunde()` (`lib/actions/pipeline.ts:1589`), som sender en hardkodet,
   ikke-redigerbar e-post direkte via Resend. Ingen utkast, ingen gjennomgang, ingen
   `email_log`-rad. `RESEND_API_KEY` er ikke satt i `.env.local`, så i praksis skjer ingenting
   utover at pipeline-steget flyttes til `kontrakt` — kunden får ingen e-post.
2. **"Send kontrakt-epost"**-lenken (kontrakt-steget) ruter riktig til
   `/admin/projects/[id]/email`, som har en fungerende AI-utkast-flyt
   (`generateEmailDraft` + redigerbart felt + faktisk sending + logging). Men
   `resolveEmailType()` mapper `kontrakt`-steget til `'general'`, som ikke har noen
   lenke-logikk — utkastet blir tomt for lenke, og sidepanelet sier "Ingen vedlegg for denne
   e-posttypen."

`/email`-siden gjør altså allerede det som etterspørres — men kun når `emailType === 'pitch'`,
og kun når man havner der via kontrakt-lenken, ikke via `TilbudStepper`.

## Løsning

Gjenbruk den eksisterende utkast-flyten på `/email`-siden begge steder, i stedet for å bygge en
ny sende-mekanisme.

### 1. `TilbudStepper` sender ikke lenger direkte

- Endre `onSend`-bruken i `app/admin/projects/[id]/page.tsx` slik at knappen "Send e-post til
  kunde →" navigerer til `/admin/projects/{projectId}/email` (samme mønster som
  "Send kontrakt-epost"-lenken allerede bruker), i stedet for å kalle `handleSendTilbud` /
  `sendTilbudToKunde`.
- `handleSendTilbud`, `sendingTilbud`-state og `sendTilbudToKunde`-funksjonen fjernes —  de blir
  ubrukt kode. Stadieovergangen `tilbud_sendt → kontrakt` skjer allerede i `/email`-sidens
  `handleSend` når en e-post av type `pitch` sendes fra `tilbud_sendt`-steget (se punkt 3).

### 2. Lenken følger med uansett e-posttype, ikke bare `pitch`

- I `app/admin/projects/[id]/email/page.tsx`, `loadDraft()`: endre betingelsen for
  `extraContext` fra `emailType === 'pitch' && hubData.pitchToken` til bare
  `hubData.pitchToken` — slik at lenken til `/p/{token}` alltid gis som kontekst til Claude når
  den finnes, uavhengig av hvilken e-posttype som er utledet fra pipeline-steget.
- Dette fikser kontrakt-stadiet: et utkast generert derfra vil nå inneholde lenken til
  pitch/tilbud/signerbar-kontrakt-siden, formulert naturlig av Claude i teksten.
- `EMAIL_TYPE_CONTEXT`- og "Vedlegg / Lenker"-panelet i sidebaren oppdateres tilsvarende, slik at
  lenken vises i høyre kolonne uansett `emailType` når `pitchToken` finnes (ikke bare for
  `pitch`), for konsistens med hva utkastet faktisk inneholder.

### 3. Ingen endring i selve sendingen

- `/api/send-email` og `handleSend()` i `/email/page.tsx` er allerede korrekte: ekte sending via
  Resend (når nøkkel finnes), logging til `email_log`, og automatisk stadieovergang til
  `kontrakt` når en `pitch`-e-post sendes fra `tilbud_sendt`. Ingen endringer her.

## Ikke i scope

- `RESEND_API_KEY` er fortsatt ikke satt — fysisk sending vil fortsatt kun logges til
  `email_log` uten faktisk å nå kundens innboks før nøkkelen er på plass. Dette er et separat,
  allerede kjent problem (se prosjektminne) og løses ikke her.
- Ingen ny UI, ingen nye database-migrasjoner, ingen endring i `/p/[token]`-siden selv.

## Testing

- Manuell verifisering: sett opp et testprosjekt med pitch + tilbud + kontrakt ferdig, trykk
  "Send e-post til kunde →" i `TilbudStepper` → skal navigere til `/email`-siden med et utkast
  som inneholder `/p/{token}`-lenken naturlig i teksten.
- Flytt et testprosjekt manuelt til `kontrakt`-steget, gå via "Send kontrakt-epost" → utkastet
  skal også her inneholde lenken.
- Bekreft at `tsc`/build fortsatt er grønn etter at ubrukt kode (`handleSendTilbud`,
  `sendingTilbud`, `sendTilbudToKunde`) er fjernet.
