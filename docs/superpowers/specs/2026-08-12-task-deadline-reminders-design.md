# Klokkeslett + påminnelse på interne oppgaver — Design spec

**Dato:** 2026-08-12
**Status:** Godkjent av Magnus (retning), venter på gjennomlesning av dette dokumentet

## Bakgrunn

Kvelden før (2026-08-11) fikk `admin_tasks` (interne oppgaver, `/admin/internal`) en frist-dato (`due_date DATE`, uten klokkeslett), med visning/redigering i `DueDateBadge`. Magnus ønsker nå to ting på toppen av det:

1. Mulighet til å sette et klokkeslett i tillegg til dato, når det er relevant.
2. En avhukingsboks for å bli påminnet — "varsle meg" — slik at man ikke må huske å sjekke oppgavelisten selv.

Appen har allerede en moden varslings-rørledning: Postgres-triggere skriver til `notifications`, en Supabase-webhook trigger `app/api/push/dispatch` på hver INSERT, som sender Web Push til alle brukerens enheter (se `2026-07-29-mobile-push-notifications-design.md`). Denne featuren gjenbruker den rørledningen fullt ut — det eneste virkelig nye er en tidsstyrt jobb som *skaper* varslingsraden i riktig øyeblikk, siden alt annet i systemet i dag er hendelsesstyrt (noen sender en melding, tildeler en oppgave osv.), ikke tidsstyrt.

**Viktig forutsetning avdekket under research:** `vercel.json` sine cron-jobber kjører ikke i praksis — appen driftes på Cloud Run (se CLAUDE.md), og Vercel-prosjektet har ingen miljøvariabler/er ikke ekte produksjon. Det finnes altså ingen fungerende "kjør hvert X minutt"-mekanisme i produksjon i dag. Denne featuren løser det med Google Cloud Scheduler (se under) — det er ikke bare kode, det krever ett manuelt oppsett-steg fra Magnus i GCP.

## Mål

- Admin kan valgfritt sette et klokkeslett på fristen til en intern oppgave, i tillegg til dato.
- Admin kan hake av "påminn meg" på en oppgave som har klokkeslett satt — får da et push-varsel til enheten sin 30 minutter før fristen.
- Påminnelsen bruker eksisterende varslings-rørledning (webhook → push) — ingen ny sende-kode.
- Påminnelsen dukker som bieffekt også opp i `/admin/varsler`, siden det er samme tabell som all annen varsling leser fra. Det regnes som en fordel, ikke noe som bygges bort.

## Scope

- **Kun `admin_tasks`** (interne oppgaver). Prosjekt-oppgaver (`tasks`-tabellen) er eksplisitt utenfor scope denne runden — kan vurderes som egen, separat spec senere hvis det er ønskelig.
- **Fast påminnelsestid: 30 minutter før fristen.** Ikke konfigurerbart per oppgave i v1.
- **Kun push-varsel** (+ den uunngåelige bieffekten i `/admin/varsler`, se over). Ingen e-post/SMS.
- **Kun for oppgaver med tildelt person** (`assignee_id` satt) og med klokkeslett satt på fristen — "påminn meg" er ikke tilgjengelig/synlig uten tid, siden "30 min før" er meningsløst på en ren dato.
- Ingen endring i hvordan admin_tasks for øvrig fungerer (drag-and-drop status, tildeling osv.).

## Arkitektur / dataflyt

```
Cloud Scheduler (nytt, kjører hvert 5. min)
        │  GET med Authorization: Bearer $CRON_SECRET (samme mønster som
        │  /api/cron/advance-produksjon)
        ▼
app/api/cron/task-reminders/route.ts (nytt)
        │  1. Finn admin_tasks der remind_me = true, status != 'done',
        │     reminder_sent_at IS NULL, assignee_id IS NOT NULL,
        │     due_date mellom now()+20min og now()+30min
        │  2. For hver: UPDATE reminder_sent_at = now()
        │  3. INSERT INTO notifications (type = 'admin_task_reminder', ...)
        ▼
Supabase Database Webhook (eksisterende, uendret)
        │  POST rad-data til app/api/push/dispatch
        ▼
app/api/push/dispatch/route.ts (eksisterende, uendret bortsett fra
        │  buildPushContent-utvidelse for den nye typen)
        ▼
Push-varsel på enheten + rad synlig i /admin/varsler
```

### Hvorfor et 10-min vindu (20–30 min) sjekket hvert 5. minutt

Et vindu nøyaktig like bredt som kjøreintervallet (5 min sjekket hvert 5. min) har ingen slингslakk: hvis én kjøring uteblir (Cloud Scheduler-feil, kald start, midlertidig 5xx), faller oppgaver med frist i akkurat det vinduet mellom to stoler for godt — ingen senere kjøring fanger dem opp igjen, siden vinduet allerede har passert. Vinduet er derfor satt til 10 minutter (`due_date` mellom `now()+20min` og `now()+30min`), dobbelt så bredt som kjøreintervallet. Det betyr at hver kvalifiserende oppgave normalt dukker opp i to påfølgende kjøringer — helt greit, siden `reminder_sent_at` uansett hindrer at den andre kjøringen sender på nytt. Prisen er at et varsel i verste fall kan komme opptil ~5 minutter tidligere enn nøyaktig 30 min før (aldri senere) — ubetydelig for formålet, og en god pris for å tåle én uteblitt kjøring uten at noen går glipp av påminnelsen helt.

## Datamodell

Ny migrasjon (`143_admin_task_reminders.sql` — sjekk `ls supabase/migrations | tail` for faktisk neste nummer når den skrives):

```sql
-- admin_tasks: klokkeslett på frist + påminnelse
ALTER TABLE admin_tasks ALTER COLUMN due_date TYPE TIMESTAMPTZ USING due_date::TIMESTAMPTZ;
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS remind_me BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- notifications: ny type + kobling til admin_tasks
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS admin_task_id UUID REFERENCES admin_tasks(id) ON DELETE CASCADE;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    -- ... eksisterende verdier (se 127_preprod_messages.sql for siste kjente
    -- fullstendige liste, pluss 'gallery_review_requested'/'gallery_review_responded'
    -- fra 131_gallery_reviews.sql) ...
    'admin_task_reminder'
  ));
```

`ALTER COLUMN ... TYPE TIMESTAMPTZ USING due_date::TIMESTAMPTZ` er trygg og ikke-destruktiv — eksisterende datoer får `00:00:00` som klokkeslett (tolkes som "ingen spesifikt klokkeslett satt", se UI-seksjonen).

**Reset av `reminder_sent_at`:** `updateAdminTaskDueDate` (og en evt. ny `updateAdminTaskRemindMe`) må nulle `reminder_sent_at` når `due_date` endres, slik at en flyttet frist kan gi en ny påminnelse i stedet for aldri å varsle (fordi den gamle `reminder_sent_at` fortsatt står igjen fra en tidligere, nå irrelevant, frist).

## UI

`DueDateBadge` (`app/admin/internal/page.tsx`) utvides:
- Date-input blir til et kombinert dato+klokkeslett-input (native `<input type="datetime-local">`, samme mønster resten av appen ikke bruker ennå, men er standard HTML — ingen ny avhengighet).
- Klokkeslett er valgfritt: lar admin sette kun dato (klokkeslett `00:00` tolkes i UI som "ikke satt", ikke midnatt-frist).
- Når et klokkeslett faktisk er satt: en liten avkrysningsboks "🔔 Påminn meg" vises ved siden av. Ikke synlig når kun dato er satt.
- Ingen endring i hvordan frister uten klokkeslett vises for øvrig (samme "Forfalt/I dag/I morgen/dato"-formatering som i går).

**Tidssone:** `<input type="datetime-local">` gir en verdi uten tidssoneinfo, tolket i nettleserens lokale tid (Europe/Oslo for alle reelle brukere her). Må konverteres eksplisitt til en ekte UTC-`Date`/ISO-streng før lagring i `TIMESTAMPTZ`-kolonnen (`new Date(localValue)` i klientkoden gjør dette riktig automatisk siden `datetime-local`-strenger tolkes som lokal tid av `Date`-konstruktøren) — bare pass på at ingen `.slice(0, 10)`-snarveier fra dagens dato-only-kode henger igjen og kutter bort klokkeslettet.

## Cloud Scheduler-oppsett (Magnus gjør dette selv, én gang)

Jeg gir de eksakte `gcloud`-kommandoene i implementasjonsplanen/PR-en (samme GCP-prosjekt `smoringauto`, region `europe-north1`, gjenbruker `CRON_SECRET`-env-variabelen som allerede finnes for de to andre cron-rutene). Kort fortalt: `gcloud scheduler jobs create http task-reminders --schedule="*/5 * * * *" --uri=".../api/cron/task-reminders" --http-method=GET --headers="Authorization=Bearer $CRON_SECRET"`.

## Feilhåndtering

- Cloud Scheduler-jobben er idempotent-vennlig via `reminder_sent_at`-sjekken — trygt å kjøre på nytt/dobbelt.
- Mangler `assignee_id` → oppgaven hoppes over stille (ingen å varsle), ikke en feil.
- `PUSH_WEBHOOK_SECRET`/VAPID ikke konfigurert → `/api/push/dispatch` returnerer allerede 503 i dag; raden i `notifications`/`admin_task_reminder` er likevel opprettet, så den vises i `/admin/varsler` selv om selve push-sendingen feiler.

## Testing

- Manuell test: sett en oppgave med frist 26 minutter fram i tid, "påminn meg" på, kjør `curl` mot `/api/cron/task-reminders` med riktig secret, verifiser at raden dukker opp i `notifications` og at push mottas på en enhet med abonnement.
- Verifiser at `reminder_sent_at` hindrer at samme oppgave varsles to ganger ved to påfølgende kjøringer.
- Verifiser at å flytte fristen etter at en påminnelse er sendt, faktisk nullstiller `reminder_sent_at` og kan gi en ny påminnelse for det nye tidspunktet.
