# Realtime task-chat + @mentions — Design spec

**Dato:** 2026-07-01
**Status:** Godkjent av Magnus

## Bakgrunn

Leafilms-teamet skal begynne å bruke systemet mer aktivt til intern kommunikasjon. En gjennomgang av dagens chat/varsel-funksjonalitet ([[2026-06-08-varsler-design]]) avdekket to hull som blir kritiske ved aktiv bruk:

1. **Task-chat** (i `app/admin/postprod/[id]/page.tsx`) er polling-basert — meldinger hentes kun når man bytter oppgave. To personer inne på samme oppgave samtidig ser ikke hverandres meldinger uten å bytte vekk og tilbake.
2. **@mentions** finnes kun som en urørt kolonne på `quote_messages` (migration 080) — ingen parsing, ingen UI, ingen varsling. Varsler-siden selv ([[2026-06-08-varsler-design]]) listet @mentions eksplisitt som "ikke inkludert (runde 2)".

Quote-chat (tilbudskommentarer) har ingen UI i det hele tatt i dag og holdes **utenfor scope** her — det er en egen, større funksjon som fortjener eget design senere.

## Mål

- Task-chat oppfører seg likt prosjekt-chatten: meldinger dukker opp live, uten reload eller oppgavebytte.
- Alle kan @nevne et teammedlem i prosjekt- og task-chat, og den personen får et tydelig, eget varsel — uansett om de er tildelt prosjektet/oppgaven eller ikke.
- Varsler-siden (`/admin/varsler`) oppdateres i sanntid, ikke bare bjelle-badgen.

## Datamodell

### Migrasjon `081_message_mentions.sql`

```sql
ALTER TABLE project_messages ADD COLUMN mentions UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE task_messages    ADD COLUMN mentions UUID[] NOT NULL DEFAULT '{}';

ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned', 'quote_assigned', 'invoice_assigned',
    'quote_mention', 'project_message_mention', 'task_message_mention'
  ));

ALTER PUBLICATION supabase_realtime ADD TABLE task_messages;
ALTER TABLE task_messages REPLICA IDENTITY FULL;
```

`quote_mention` er allerede i enumen fra tidligere arbeid og røres ikke — den kobles til en trigger den dagen quote-chat-UI bygges.

### Oppdaterte triggere

`notify_project_message()` og `notify_task_message()` (fra migration 056) utvides slik at:

- For hver bruker i `NEW.mentions`: opprett varsel med type `project_message_mention` / `task_message_mention` (unntatt hvis brukeren er avsender).
- For assignees som IKKE er i `NEW.mentions`: opprett vanlig `project_message` / `task_message`-varsel som i dag.
- En assignee som også er nevnt, får **kun** mention-varselet — ikke begge.
- Avsender ekskluderes alltid fra all varsling om egen melding.

```sql
CREATE OR REPLACE FUNCTION notify_task_message()
RETURNS TRIGGER AS $$
DECLARE
  rec        RECORD;
  preview    TEXT;
  proj_id    UUID;
  sndr_name  TEXT;
BEGIN
  preview := left(NEW.message, 80);
  SELECT project_id INTO proj_id FROM tasks WHERE id = NEW.task_id;
  SELECT COALESCE(name, email, 'Ukjent') INTO sndr_name FROM profiles WHERE id = NEW.user_id;

  -- Mentions først (uavhengig av assignee-status)
  FOR rec IN
    SELECT DISTINCT m AS profile_id
    FROM unnest(NEW.mentions) AS m
    WHERE m != NEW.user_id
  LOOP
    INSERT INTO notifications (user_id, type, project_id, task_id, message_preview, sender_name)
    VALUES (rec.profile_id, 'task_message_mention', proj_id, NEW.task_id, preview, sndr_name);
  END LOOP;

  -- Vanlige assignee-varsler, ekskluder de som allerede fikk mention-varsel
  FOR rec IN
    SELECT DISTINCT ta.profile_id
    FROM task_assignees ta
    WHERE ta.task_id = NEW.task_id
      AND ta.profile_id != NEW.user_id
      AND ta.profile_id != ALL(NEW.mentions)
  LOOP
    INSERT INTO notifications (user_id, type, project_id, task_id, message_preview, sender_name)
    VALUES (rec.profile_id, 'task_message', proj_id, NEW.task_id, preview, sndr_name);
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

`notify_project_message()` speiler samme logikk med `task_assignees` joinet mot prosjektets tasks (som i dag).

## Frontend

### 1. Realtime task-chat

**Fil:** `app/admin/postprod/[id]/page.tsx`

- Ny `useEffect` som setter opp en Supabase `postgres_changes`-subscription (INSERT) på `task_messages` filtrert på `task_id = eq.<selectedTaskId>`, re-kjørt/ryddet opp når valgt oppgave endres — speiler mønsteret i `components/project/ProjectChat.tsx`.
- Innkommende meldinger fra andre brukere legges til i `messages`-state; egne sendte meldinger filtreres bort fra realtime-eventet siden de allerede er lagt til optimistisk (match på `id`).
- Auto-scroll til bunn ved nye meldinger, som i dag.

### 2. Delt mention-input-komponent

**Ny fil:** `components/shared/MentionInput.tsx`

Brukes av både `ProjectChat.tsx` og task-chat-delen av `app/admin/postprod/[id]/page.tsx` for å unngå duplisert autocomplete-logikk.

- Lytter etter `@` i tekstfeltet, åpner dropdown med teammedlemmer fra `profiles`, filtrert live på tekst etter `@`.
- Piltaster + Enter/Tab velger, Escape lukker.
- Ved valg settes `@navn ` inn i teksten; valgt bruker-ID legges i lokal `mentions: string[]`-state knyttet til meldingsutkastet.
- Ved sending sendes `mentions` sammen med meldingsteksten til hhv. `/api/projects/[id]/messages` og `sendTaskMessage()`-server-actionen, som skriver rett til den nye `mentions`-kolonnen.
- Visning i meldingslisten: enkel regex-basert utheving av `@ord`-mønstre i rendret tekst (lys lilla, matcher eksisterende aksentfarge) — ingen re-oppslag mot databasen for visning.
- Autocomplete-listen viser hele teamet (ikke begrenset til assignees).

### 3. Varsel-UI for nye typer

**Filer:** `components/admin/NotificationBell.tsx`, `app/admin/varsler/VarslerClient.tsx`

- `project_message_mention` → tekst "**{navn}** nevnte deg i prosjekt-chatten", eget ikon (skiller seg fra vanlig chat-ikon).
- `task_message_mention` → tekst "**{navn}** nevnte deg i en oppgave", samme ikon-familie som over.
- Navigasjon ved klikk følger samme mål som eksisterende `project_message`/`task_message`-typer (til hhv. prosjektside / postprod-oppgave).

### 4. Realtime varsler-side

**Fil:** `app/admin/varsler/VarslerClient.tsx`

- Ny `postgres_changes`-subscription (INSERT + UPDATE) på `notifications` filtrert på `user_id = eq.<innlogget bruker>`.
- INSERT: nytt varsel dyttes inn øverst i listen.
- UPDATE: (f.eks. lest fra bjella eller en annen fane) oppdaterer raden sin `read`-status live uten reload.

## Ikke inkludert

- Quote-chat UI og `quote_mention`-trigger (eget fremtidig design).
- E-postvarsler eller push-notifications — alt forblir in-app.
- Read-receipts, edit/delete av meldinger, threads/svar, meldingssøk.
- Begrense mention-autocomplete til kun assignees.

## Testing

- Manuell test: to innloggede brukere (to nettlesere/faner) i samme oppgave-chat samtidig — verifiser at meldinger dukker opp live for begge uten reload.
- Manuell test: @nevn en person som ikke er assignee på oppgaven/prosjektet — verifiser at de får `*_mention`-varsel, og at de IKKE i tillegg får et duplikat vanlig meldingsvarsel.
- Manuell test: @nevn en person som også er assignee — verifiser kun ett varsel (mention), ikke to.
- Manuell test: varsler-siden åpen i én fane, trigg nytt varsel fra en annen bruker — verifiser at det dukker opp uten reload; marker som lest i bjella — verifiser at raden på varsler-siden oppdateres.
