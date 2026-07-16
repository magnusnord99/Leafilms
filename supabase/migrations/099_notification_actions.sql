-- 099_notification_actions.sql
-- Varsler skal kunne slettes, besvares og reageres på direkte fra /admin/varsler:
--  1. message_id-kolonne på notifications (polymorf: peker til project_messages/
--     task_messages/quote_messages/conversation_messages avhengig av type — ingen FK)
--     slik at reaksjoner kan målrettes mot kildemeldingen.
--  2. DELETE-policy (056 ga kun SELECT/UPDATE).
--  3. Alle notify-triggerne gjenskapes med message_id i INSERT-ene.
--     Funksjonskroppene er hentet fra live-databasen (pg_get_functiondef) og er
--     uendret utover message_id — IKKE fra de gamle migrasjonsfilene.
-- Gamle varsler har message_id = NULL; UI-et skjuler reaksjonsknappen for dem.

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notifications' AND policyname = 'Users can delete own notifications'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can delete own notifications" ON notifications FOR DELETE TO authenticated USING (auth.uid() = user_id)';
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- notify_direct_message (fra 094): + message_id = NEW.id
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_direct_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  rec       RECORD;
  sndr_name TEXT;
  preview   TEXT;
BEGIN
  SELECT COALESCE(name, email, 'Ukjent') INTO sndr_name FROM profiles WHERE id = NEW.sender_id;
  preview := left(NEW.content, 80);

  FOR rec IN
    SELECT cp.profile_id
    FROM conversation_participants cp
    WHERE cp.conversation_id = NEW.conversation_id
      AND cp.profile_id != NEW.sender_id
  LOOP
    INSERT INTO notifications (user_id, type, conversation_id, message_preview, sender_name, message_id)
    VALUES (rec.profile_id, 'direct_message', NEW.conversation_id, preview, sndr_name, NEW.id);
  END LOOP;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- notify_message_reaction (fra 093): + message_id = NEW.message_id
-- (peker på meldingen det ble reagert på, så mottakeren kan svare/reagere tilbake)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_message_reaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  owner_id   UUID;
  proj_id    UUID;
  tsk_id     UUID;
  sndr_name  TEXT;
  notif_type TEXT;
BEGIN
  SELECT COALESCE(name, email, 'Ukjent') INTO sndr_name FROM profiles WHERE id = NEW.user_id;

  IF NEW.message_type = 'project' THEN
    SELECT user_id, project_id INTO owner_id, proj_id FROM project_messages WHERE id = NEW.message_id;
    notif_type := 'project_message_reaction';
  ELSIF NEW.message_type = 'task' THEN
    SELECT tm.user_id, t.project_id, tm.task_id INTO owner_id, proj_id, tsk_id
    FROM task_messages tm JOIN tasks t ON t.id = tm.task_id
    WHERE tm.id = NEW.message_id;
    notif_type := 'task_message_reaction';
  ELSIF NEW.message_type = 'quote' THEN
    SELECT user_id, project_id INTO owner_id, proj_id FROM quote_messages WHERE id = NEW.message_id;
    notif_type := 'quote_message_reaction';
  END IF;

  -- Ingen melding funnet, eller bruker reagerer på sin egen melding — ikke varsle
  IF owner_id IS NULL OR owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, type, project_id, task_id, message_preview, sender_name, message_id)
  VALUES (owner_id, notif_type, proj_id, tsk_id, NEW.emoji, sndr_name, NEW.message_id);

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- notify_project_message (fra 082): + message_id = NEW.id i alle tre grenene
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_project_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  rec      RECORD;
  preview  TEXT;
  notified BOOLEAN := false;
  lead_id  UUID;
BEGIN
  preview := left(NEW.content, 80);

  FOR rec IN
    SELECT DISTINCT m AS profile_id
    FROM unnest(NEW.mentions) AS m
    WHERE m != NEW.user_id
  LOOP
    notified := true;
    INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name, message_id)
    VALUES (rec.profile_id, 'project_message_mention', NEW.project_id, preview, COALESCE(NEW.user_name, 'Ukjent'), NEW.id);
  END LOOP;

  FOR rec IN
    SELECT DISTINCT ta.profile_id
    FROM task_assignees ta
    JOIN tasks t ON t.id = ta.task_id
    WHERE t.project_id = NEW.project_id
      AND ta.profile_id != NEW.user_id
      AND ta.profile_id != ALL(NEW.mentions)
  LOOP
    notified := true;
    INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name, message_id)
    VALUES (rec.profile_id, 'project_message', NEW.project_id, preview, COALESCE(NEW.user_name, 'Ukjent'), NEW.id);
  END LOOP;

  IF NOT notified THEN
    SELECT project_lead_id INTO lead_id FROM projects WHERE id = NEW.project_id;
    IF lead_id IS NOT NULL AND lead_id != NEW.user_id THEN
      INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name, message_id)
      VALUES (lead_id, 'project_message', NEW.project_id, preview, COALESCE(NEW.user_name, 'Ukjent'), NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- notify_quote_message (fra 083): + message_id = NEW.id
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_quote_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  rec       RECORD;
  preview   TEXT;
  assignee  UUID;
  sndr_name TEXT;
BEGIN
  preview := left(NEW.message, 80);
  SELECT COALESCE(name, email, 'Ukjent') INTO sndr_name FROM profiles WHERE id = NEW.user_id;

  FOR rec IN
    SELECT DISTINCT m AS profile_id
    FROM unnest(NEW.mentions) AS m
    WHERE m != NEW.user_id
  LOOP
    INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name, message_id)
    VALUES (rec.profile_id, 'quote_mention', NEW.project_id, preview, sndr_name, NEW.id);
  END LOOP;

  SELECT quote_assignee_id INTO assignee FROM projects WHERE id = NEW.project_id;
  IF assignee IS NOT NULL AND assignee != NEW.user_id AND assignee != ALL(NEW.mentions) THEN
    INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name, message_id)
    VALUES (assignee, 'quote_message', NEW.project_id, preview, sndr_name, NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- notify_task_message (fra 081): + message_id = NEW.id i begge grenene
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_task_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  rec       RECORD;
  proj_id   UUID;
  sndr_name TEXT;
  preview   TEXT;
BEGIN
  preview := left(NEW.message, 80);
  SELECT project_id INTO proj_id FROM tasks WHERE id = NEW.task_id;
  SELECT COALESCE(name, email, 'Ukjent') INTO sndr_name FROM profiles WHERE id = NEW.user_id;

  FOR rec IN
    SELECT DISTINCT m AS profile_id
    FROM unnest(NEW.mentions) AS m
    WHERE m != NEW.user_id
  LOOP
    INSERT INTO notifications (user_id, type, project_id, task_id, message_preview, sender_name, message_id)
    VALUES (rec.profile_id, 'task_message_mention', proj_id, NEW.task_id, preview, sndr_name, NEW.id);
  END LOOP;

  FOR rec IN
    SELECT DISTINCT ta.profile_id
    FROM task_assignees ta
    WHERE ta.task_id = NEW.task_id
      AND ta.profile_id != NEW.user_id
      AND ta.profile_id != ALL(NEW.mentions)
  LOOP
    INSERT INTO notifications (user_id, type, project_id, task_id, message_preview, sender_name, message_id)
    VALUES (rec.profile_id, 'task_message', proj_id, NEW.task_id, preview, sndr_name, NEW.id);
  END LOOP;

  RETURN NEW;
END;
$function$;
