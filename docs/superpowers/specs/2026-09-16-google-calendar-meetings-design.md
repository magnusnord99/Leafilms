# Book møte via Google Calendar — Design spec

**Dato:** 2026-09-16
**Status:** Godkjent av Magnus (retning + seksjoner), venter på gjennomlesning av dette dokumentet

## Bakgrunn

I dag, når et prosjekt når «Møte»-steget i pipelinen (`projects.pipeline_stage = 'møte'`), klikker staben «Send møtelink» (`ActionBtn` i `app/admin/projects/BoardView.tsx:889`), som åpner en e-postkomponist (`app/admin/projects/[id]/email/page.tsx`) med et rent fritekstfelt for en møtelenke de selv har opprettet et annet sted (Google Meet, Zoom, e.l.). Lenken lagres i `projects.pipeline_data->>'meeting_link'` (satt av `sendMeetingLink` i `lib/actions/pipeline.ts`) og mailes til kunden via Resend. Ingen dato/tid lagres noe sted i systemet.

Magnus ønsker å slippe å opprette møtet et annet sted og lime inn lenken — møtet skal kunne opprettes direkte i Leafilms, med ekte Google Calendar-invitasjon og Google Meet-lenke generert automatisk.

Et internt møtesystem finnes allerede (`118_meetings.sql`: `meetings` + `meeting_participants`, CRUD i `lib/actions/meetings.ts`, vist på `/admin/calendar`), men det støtter kun interne kolleger (`profiles`) som deltakere — ingen eksterne (kunde-)deltakere, og `meeting_link` er fortsatt bare en fritekst-streng, ikke noe som genereres.

**Viktig forutsetning:** Dette krever Google Workspace på `leafilms.no` med et service account som har domain-wide delegation godkjent av en Workspace-admin. Dette er ikke satt opp ennå — Magnus gjør dette selv når klart. All kode i denne spec-en bygges nå og lar seg committe/deploye trygt uten at det er på plass; funksjonen viser bare en tydelig «ikke konfigurert»-melding til miljøvariabelen finnes.

## Mål

- Staben kan booke et møte med en kunde direkte i Leafilms — velge dato, klokkeslett og varighet — uten å forlate appen.
- En ekte Google Calendar-hendelse opprettes på den ansvarlige ansattes egen `@leafilms.no`-kalender, med en automatisk generert Google Meet-lenke.
- Kunden får en ekte Google-kalenderinvitasjon (Google sender denne selv til kundens e-post når hendelsen opprettes med kunden som deltaker) — ingen egen e-post fra Leafilms trengs for selve invitasjonen.
- Ledig/opptatt for den ansvarlige sjekkes før bekreftelse, som en advarsel (ikke en hard sperre).
- Møtet kan flyttes eller avlyses fra Leafilms i etterkant — oppdaterer/sletter Google-hendelsen, som igjen varsler kunden automatisk.
- Den eksisterende «Send lenke manuelt»-veien beholdes uendret, som et sidestilt alternativ for de tilfellene møtet ikke skal skje via Google Meet.

## Scope

- **Kun prosjekt-pipelinens «Møte»-steg** (`pipeline_stage = 'møte'`). Ikke `leads`-tabellen (som er en separat, løsere CRM-liste for prospekter før de blir prosjekt — se `converted_to_project_id` i `040_project_management.sql`) — leads har ingen egen møte-booking i denne runden.
- **Google Calendar + Google Meet, ingen leverandør-abstraksjon.** Ingen støtte for andre videotjenester i den nye automatiserte veien — det manuelle fritekstfeltet dekker unntakene.
- **Én ekstern deltaker per møte** (kunden). Ingen støtte for flere eksterne deltakere i v1.
- **Ledig/opptatt er en advarsel, ikke en sperre** — staben kan bevisst overstyre og booke likevel.
- Ingen endring i hvordan det interne møtesystemet (`/admin/calendar`, kolleger-møter) fungerer — dette er en ny, sidestilt funksjon som gjenbruker samme tabell.

## Arkitektur / dataflyt

```
"Book møte"-panel (nytt, på prosjektets Møte-steg)
        │  1. Velg dato/klokkeslett/varighet → sjekkLedig()
        │  2. Bekreft → opprettMøte()
        ▼
lib/services/google-calendar.ts (nytt)
        │  Service account + domain-wide delegation, impersonerer
        │  den ansvarliges profiles.email (må være en ekte
        │  @leafilms.no Workspace-konto — se forutsetning under)
        ▼
Google Calendar API (calendar.events.insert med
        conferenceDataVersion: 1 for auto-generert Meet-lenke,
        attendees: [ansvarlig, kunde], sendUpdates: 'all')
        ▼
Google sender kalenderinvitasjon til kundens e-post automatisk
        │
        ▼
meetings-rad lagres (project_id, google_event_id, meeting_link,
        starts_at, ends_at, external_name, external_email)
```

Flytting/avlysning følger samme vei via `calendar.events.patch`/`calendar.events.delete` — Google sender selv oppdatert varsel/avlysning til kunden når `sendUpdates: 'all'` brukes.

### Hvorfor ingen leverandør-abstraksjon

Et generisk «kalender-leverandør»-grensesnitt (for hypotetisk fremtidig Zoom/Outlook-støtte) er spekulativ kompleksitet ingen har bedt om — i tråd med «ingen over-ingeniering» i CLAUDE.md. `lib/services/google-calendar.ts` kaller Google direkte. Skulle en ny leverandør faktisk bli aktuelt senere, er det en egen, separat spec.

## Datamodell

Ny migrasjon (`159_google_calendar_meetings.sql` — sjekk `ls supabase/migrations | tail` for faktisk neste nummer når den skrives):

```sql
-- meetings: kobling til prosjekt + ekstern deltaker + Google-hendelse
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS external_name TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS external_email TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS google_event_id TEXT;

CREATE INDEX IF NOT EXISTS idx_meetings_project ON meetings(project_id);
```

Ingen RLS-endring nødvendig — samme begrunnelse som `lead_id` på `conversations` i `148_lead_chat.sql`: den eksisterende `organizer_id`-baserte policyen på `meetings` bryr seg ikke om hvilken entitet møtet i tillegg er koblet til. `meeting_participants` (kun interne `profiles`) røres ikke — den eksterne deltakeren lever kun som `external_name`/`external_email` på `meetings`, ikke som en rad der.

`organizer_id` (finnes allerede) settes til den ansvarlige ansattes `profiles.id` — samme person appen impersonerer mot Google.

## API / service-lag

**`lib/services/google-calendar.ts`** (nytt):

- `sjekkLedig(organizerEmail: string, dateISO: string): Promise<BusySlot[]>` — kaller `freebusy.query` for organizerens kalender den valgte dagen. Feiler stille til tom liste (se Feilhåndtering).
- `opprettMøte(input: { organizerEmail, title, startsAt, endsAt, externalName, externalEmail, notes? }): Promise<{ googleEventId, meetingLink }>` — `calendar.events.insert` med `conferenceDataVersion: 1`, `attendees: [{email: organizerEmail}, {email: externalEmail}]`, `sendUpdates: 'all'`.
- `flyttMøte(googleEventId, organizerEmail, nyStart, nySlutt): Promise<void>` — `calendar.events.patch`.
- `avlysMøte(googleEventId, organizerEmail): Promise<void>` — `calendar.events.delete` med `sendUpdates: 'all'`.

Autentisering: `google.auth.JWT` med service accountens nøkkel (fra `GOOGLE_SERVICE_ACCOUNT_KEY`-miljøvariabelen, JSON-innhold) og `subject: organizerEmail` for impersonation via domain-wide delegation. Ingen per-bruker OAuth-tokens å lagre.

**`lib/actions/meetings.ts`** (utvides): `bookProjectMeeting`, `rescheduleProjectMeeting`, `cancelProjectMeeting` — tynne wrappere som kaller service-laget og deretter lagrer/oppdaterer/sletter `meetings`-raden.

**Forutsetning som må stemme når Workspace er klart:** `organizerEmail` = den ansvarliges `profiles.email`. Det krever at hver ansatts `profiles.email` faktisk er deres ekte `@leafilms.no`-konto på det tidspunktet — i dag er f.eks. Eivinds e-post en privat Gmail-adresse. Å oppdatere `profiles.email` til de nye kontoene er noe Magnus gjør manuelt når Workspace-kontoene er opprettet, ikke noe som bygges her.

## UI

I «Møte»-steget (der «Send møtelink» ligger i dag, `BoardView.tsx:889` og tilsvarende sted på prosjektsiden) vises et lite panel med to sidestilte valg:

- **«Book møte»** (ny, primær): dato-velger, klokkeslett, varighet (forhåndsutfylt 30 min). Ved valgt dato hentes ledig/opptatt for den ansvarlige og vises som en advarsel dersom det er overlapp (blokkerer ikke). Bekreft → oppretter møtet, viser bekreftelse med tidspunkt + «Åpne i Google Calendar»-lenke.
- **«Send lenke manuelt»** (uendret): dagens fritekstfelt + e-postkomponist.

Når et møte er booket via Google-veien, vises tidspunkt + status i stedet for «Send møtelink»-knappen, med **«Flytt møte»** (åpner samme dato/tid-velger på nytt) og **«Avlys møte»** (bekreftelsesdialog).

## Google Workspace-oppsett (Magnus gjør dette selv, én gang)

Eksakte steg gis i implementasjonsplanen/PR-en, i korte trekk:

1. Opprett Google Workspace for `leafilms.no` (utenfor denne spec-ens scope).
2. I Google Cloud Console: opprett et prosjekt, aktiver Google Calendar API, opprett et service account, generer en JSON-nøkkel.
3. I Google Workspace Admin Console → Sikkerhet → API-kontroller → Domenevid delegering: legg til service accountens klient-ID med scope `https://www.googleapis.com/auth/calendar`.
4. Legg service account-nøkkelen (hele JSON-innholdet) inn som `GOOGLE_SERVICE_ACCOUNT_KEY` i `.env.local` og som secret i Cloud Run (samme mønster som `SUPABASE_SERVICE_ROLE_KEY` i dag).
5. Oppdater hver ansatts `profiles.email` til deres nye `@leafilms.no`-adresse.

Helt til dette er gjort viser «Book møte»-knappen meldingen «Google-integrasjon er ikke satt opp ennå» — resten av appen er upåvirket.

## Feilhåndtering

- `GOOGLE_SERVICE_ACCOUNT_KEY` mangler → «Book møte» viser tydelig «ikke konfigurert»-melding i stedet for å late som den virker. «Send lenke manuelt» upåvirket.
- `sjekkLedig()` feiler (nettverk, manglende tilgang) → behandles som «ingen kjente konflikter», ingen advarsel vises. Dette er en hjelpefunksjon, ikke en sperre — en feil her skal aldri hindre selve bookingen.
- `opprettMøte()`/`flyttMøte()`/`avlysMøte()` feiler → vis Googles feilmelding rått i UI-et (kun interne brukere, ingen grunn til å oversette/skjule den). `meetings`-raden lagres/oppdateres/slettes **kun** hvis Google-kallet faktisk lyktes, slik at Leafilms og Google Calendar aldri kommer ut av synk.

## Testing

- `npx tsc --noEmit` + `npx eslint` på endrede filer (standard verifisering).
- Reelle Google-kall kan ikke testes uten et faktisk Workspace + service account — dette finnes ikke i dette miljøet ennå. Koden verifiseres ved gjennomlesning av logikk og typesjekk nå.
- Når Workspace + service account er på plass: manuell ende-til-ende-test av Magnus — book et testmøte, verifiser at hendelsen dukker opp i Google Calendar med Meet-lenke og at kunde-e-posten (bruk egen adresse til test) mottar invitasjonen, deretter flytt og avlys samme møte og verifiser at Google-hendelsen følger med.
