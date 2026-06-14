# Design: Tilbud-ansvarlig i pipeline

**Dato:** 2026-06-14  
**Status:** Godkjent av Magnus

## Oversikt

Når et prosjekt skal sendes tilbud til kunden, må noen på teamet ha ansvaret. I dag finnes det ingen kobling mellom pipeline-steget «Sende tilbud» og et konkret teammedlem. Resultatet er at oppgaven kan glippe.

Løsningen: lagre `quote_assignee_id` på prosjektet, sett den helst ved opprettelse, og blokker stage-byttet til steget hvis feltet mangler.

---

## Flyt

### 1. Ved opprettelse av lead (happy path)

- Feltet **«Tilbud-ansvarlig»** legges til nederst i «Salgsinformasjon»-seksjonen i `/admin/leads/new`
- Visuelt: separator-linje + inline label + dropdown — ikke eget kort
- Feltet er **valgfritt** ved opprettelse
- Hvis satt: `quote_assignee_id` lagres på prosjektet og den valgte personen får et `quote_assigned`-varsel umiddelbart

### 2. Ved drag til «Sende tilbud» uten ansvarlig (fallback)

- `updatePipelineStage` sjekker om `quote_assignee_id` er null når destinasjon er `tilbud_sendt`
- Hvis null: returnerer feilkode `MISSING_QUOTE_ASSIGNEE` (kaster ikke exception)
- Pipeline-klienten fanger koden og viser **TilbudAssignModal**
- Modalen viser prosjektnavnet, en person-picker (alle profiles), «Avbryt» og «Flytt prosjekt»
- «Avbryt» angrer draget uten å endre noe
- «Flytt prosjekt» kaller `assignQuoteAndMove(projectId, assigneeId)` som:
  1. Setter `quote_assignee_id` på prosjektet
  2. Bytter `pipeline_stage` til `tilbud_sendt`
  3. Sender `quote_assigned`-varsel til den ansvarlige
- Mønsteret er identisk med eksisterende `KontraktWarningModal`

---

## Datamodell

### Migrasjon `065_quote_assignee.sql`

```sql
ALTER TABLE projects
  ADD COLUMN quote_assignee_id UUID
  REFERENCES auth.users(id) ON DELETE SET NULL;

-- Utvid notification_type-enum med quote_assigned
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'quote_assigned';
```

RLS: eksisterende `projects`-policy dekker den nye kolonnen — ingen ny policy nødvendig.

---

## Varsel

- Type: `quote_assigned`
- Tittel: «Du er ansvarlig for å sende tilbud»
- Kropp: `«{prosjektnavn}» · Tildelt av {tildeler}`
- Link: `/admin/projects/{id}`
- Sendes via eksisterende `createNotification` i `lib/actions/notifications.ts`
- Sendes **både** fra ny lead-form og fra `assignQuoteAndMove`

---

## Filer som endres

| Fil | Endring |
|-----|---------|
| `supabase/migrations/065_quote_assignee.sql` | Ny migrasjon |
| `lib/types.ts` | `NotificationType` + `Project`-type: legg til `quote_assignee_id` |
| `lib/actions/leads.ts` | `createLead` tar imot `quote_assignee_id?`, lagrer + sender varsel |
| `lib/actions/pipeline.ts` | `updatePipelineStage`: sjekk for `tilbud_sendt`, ny `assignQuoteAndMove`-action |
| `app/admin/leads/new/page.tsx` | Hent profiles, legg til person-picker i skjemaet |
| `app/admin/pipeline/page.tsx` | Fang `MISSING_QUOTE_ASSIGNEE`, vis `TilbudAssignModal` |

---

## Avgrensninger (ikke i scope)

- Ingen visning av assignee på pipeline-kortet (kan itereres inn senere)
- Ingen re-varsling hvis assignee byttes etter tildeling
- Kun `tilbud_sendt`-steget får denne behandlingen — andre steg er ikke i scope nå
