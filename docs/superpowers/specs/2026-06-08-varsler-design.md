# Varsel-system — Design spec

**Dato:** 2026-06-08
**Status:** Godkjent av Magnus

## Oversikt

Leafilms-teamet trenger varsler når noen skriver i en chat de er tilknyttet. Det finnes to chat-nivåer: prosjekt-chat (felles for alle med oppgaver i prosjektet) og oppgave-chat (kun for assignees på den spesifikke oppgaven). Varsler lagres persistent i databasen via Postgres-triggere og vises som badge i navbaren + på en dedikert varsel-side.

## Datamodell

### Ny tabell: `notifications`

```sql
CREATE TABLE notifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type            TEXT        NOT NULL CHECK (type IN ('project_message', 'task_message')),
  project_id      UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id         UUID        REFERENCES tasks(id) ON DELETE CASCADE,
  message_preview TEXT        NOT NULL,
  sender_name     TEXT        NOT NULL,
  read            BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- `task_id` er nullable — kun satt for `task_message`-varsler
- `message_preview` lagrer første 80 tegn av meldingen (for visning uten ekstra DB-kall)
- Avsender varsles aldri om seg selv

### Indekser

```sql
CREATE INDEX idx_notifications_user_id     ON notifications(user_id, read, created_at DESC);
CREATE INDEX idx_notifications_project_id  ON notifications(project_id);
```

### RLS

- Brukere kan kun se og oppdatere sine egne varsler (`user_id = auth.uid()`)
- Kun system (trigger) kan INSERT — ingen direkte klient-insert

## DB-triggere

### Trigger 1 — prosjekt-melding (`project_messages`)

Kjøres etter INSERT på `project_messages`. Finner alle profiler med minst én task i prosjektet (via `task_assignees` → `tasks`). Oppretter én `notification`-rad per mottaker, unntatt avsender.

```sql
CREATE OR REPLACE FUNCTION notify_project_message()
RETURNS TRIGGER AS $$
DECLARE
  rec RECORD;
  preview TEXT;
BEGIN
  preview := left(NEW.content, 80);

  FOR rec IN
    SELECT DISTINCT ta.profile_id
    FROM task_assignees ta
    JOIN tasks t ON t.id = ta.task_id
    WHERE t.project_id = NEW.project_id
      AND ta.profile_id != NEW.user_id
  LOOP
    INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name)
    VALUES (rec.profile_id, 'project_message', NEW.project_id, preview, COALESCE(NEW.user_name, 'Ukjent'));
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_project_message
AFTER INSERT ON project_messages
FOR EACH ROW EXECUTE FUNCTION notify_project_message();
```

### Trigger 2 — oppgave-melding (`task_messages`)

Kjøres etter INSERT på `task_messages`. Finner alle assignees på oppgaven. Oppretter varsel per mottaker, unntatt avsender.

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

  SELECT COALESCE(name, email, 'Ukjent') INTO sndr_name
  FROM profiles WHERE id = NEW.user_id;

  FOR rec IN
    SELECT DISTINCT ta.profile_id
    FROM task_assignees ta
    WHERE ta.task_id = NEW.task_id
      AND ta.profile_id != NEW.user_id
  LOOP
    INSERT INTO notifications (user_id, type, project_id, task_id, message_preview, sender_name)
    VALUES (rec.profile_id, 'task_message', proj_id, NEW.task_id, preview, sndr_name);
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_task_message
AFTER INSERT ON task_messages
FOR EACH ROW EXECUTE FUNCTION notify_task_message();
```

## Frontend

### 1. Badge i admin-navbaren

**Fil:** `components/admin/NotificationBell.tsx` (ny)

- Henter antall uleste varsler for innlogget bruker ved mount
- Supabase Realtime-subscription på `notifications` WHERE `user_id = me AND read = false` — oppdateres live
- Viser bell-ikon med rød badge (antall) hvis `count > 0`, ellers bare ikon
- Badge viser maks "9+" for tall over 9
- Klikk navigerer til `/admin/varsler`

**Integrering:** Legges inn i `app/admin/layout.tsx` øverst til høyre i headeren.

### 2. Varsel-side: `/admin/varsler`

**Fil:** `app/admin/varsler/page.tsx` (ny, server component med client-del)

Layout (cinematisk mørk palett, DM Sans / Cormorant):
- Header: "Varsler" + knapp "Merk alle som lest"
- Liste sortert på `created_at DESC`
- Hvert varsel-kort viser:
  - Avsendernavn (DM Sans, fremhevet)
  - Meldingspreview (kursiv, dempet)
  - Prosjektnavn + eventuelt oppgavenavn
  - Tidspunkt (relativt: "3 min siden", "i går")
  - Visuell indikator for ulest (gull venstre-border)
- Klikk på varsel → markerer som lest + navigerer
- Tom-tilstand hvis ingen varsler

### 3. Navigasjon fra varsel

| Type | Destination |
|---|---|
| `project_message` | `/admin/projects/[project_id]` |
| `task_message` | `/admin/postprod/[project_id]` |

### 4. Server actions: `lib/actions/notifications.ts`

```typescript
getNotifications()      // Henter alle varsler for innlogget bruker
getUnreadCount()        // Antall uleste (for badge)
markAsRead(id)          // Merk ett varsel som lest
markAllAsRead()         // Merk alle som lest
```

## Migrasjoner

Én migrasjon: `056_notifications.sql`
- Oppretter `notifications`-tabell med indekser og RLS
- Oppretter begge trigger-funksjoner og triggere

## Ikke inkludert (runde 2)

- @mention / tagging i meldinger
- E-postvarsler via Resend
- Push-notifications (browser)
- Varsel-innstillinger per bruker (velg hva man vil varsles om)
