-- 138_notification_urgency.sql
-- "Haster"-merking av meldinger/varsler. Avsender kan merke en melding som
-- hastende når den sendes; flagget følger med varselet triggeren lager, slik
-- at /admin/varsler kan sortere/utheve det og push-varselet kan prefikses.
--
-- Funksjonskroppene under er hentet fra siste kjente versjon i migrasjonshistorikken
-- (099_notification_actions.sql for project/task/quote/direct, 127_preprod_messages.sql
-- for preprod — ingen av disse er overskrevet senere) og kun utvidet med urgent-kolonnen.
--
-- NB: conversation_messages er direct_messages omdøpt (se 096_production_chat.sql) —
-- trigger-funksjonen heter fortsatt notify_direct_message.

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS urgent BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE project_messages      ADD COLUMN IF NOT EXISTS urgent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE task_messages         ADD COLUMN IF NOT EXISTS urgent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE quote_messages        ADD COLUMN IF NOT EXISTS urgent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE preprod_messages      ADD COLUMN IF NOT EXISTS urgent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS urgent BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- notify_direct_message: + urgent = NEW.urgent (fra 099_notification_actions.sql)
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
    INSERT INTO notifications (user_id, type, conversation_id, message_preview, sender_name, message_id, urgent)
    VALUES (rec.profile_id, 'direct_message', NEW.conversation_id, preview, sndr_name, NEW.id, NEW.urgent);
  END LOOP;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- notify_project_message: + urgent = NEW.urgent i alle tre grenene
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
    INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name, message_id, urgent)
    VALUES (rec.profile_id, 'project_message_mention', NEW.project_id, preview, COALESCE(NEW.user_name, 'Ukjent'), NEW.id, NEW.urgent);
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
    INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name, message_id, urgent)
    VALUES (rec.profile_id, 'project_message', NEW.project_id, preview, COALESCE(NEW.user_name, 'Ukjent'), NEW.id, NEW.urgent);
  END LOOP;

  IF NOT notified THEN
    SELECT project_lead_id INTO lead_id FROM projects WHERE id = NEW.project_id;
    IF lead_id IS NOT NULL AND lead_id != NEW.user_id THEN
      INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name, message_id, urgent)
      VALUES (lead_id, 'project_message', NEW.project_id, preview, COALESCE(NEW.user_name, 'Ukjent'), NEW.id, NEW.urgent);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- notify_quote_message: + urgent = NEW.urgent i begge grenene
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
    INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name, message_id, urgent)
    VALUES (rec.profile_id, 'quote_mention', NEW.project_id, preview, sndr_name, NEW.id, NEW.urgent);
  END LOOP;

  SELECT quote_assignee_id INTO assignee FROM projects WHERE id = NEW.project_id;
  IF assignee IS NOT NULL AND assignee != NEW.user_id AND assignee != ALL(NEW.mentions) THEN
    INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name, message_id, urgent)
    VALUES (assignee, 'quote_message', NEW.project_id, preview, sndr_name, NEW.id, NEW.urgent);
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- notify_task_message: + urgent = NEW.urgent i begge grenene
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
    INSERT INTO notifications (user_id, type, project_id, task_id, message_preview, sender_name, message_id, urgent)
    VALUES (rec.profile_id, 'task_message_mention', proj_id, NEW.task_id, preview, sndr_name, NEW.id, NEW.urgent);
  END LOOP;

  FOR rec IN
    SELECT DISTINCT ta.profile_id
    FROM task_assignees ta
    WHERE ta.task_id = NEW.task_id
      AND ta.profile_id != NEW.user_id
      AND ta.profile_id != ALL(NEW.mentions)
  LOOP
    INSERT INTO notifications (user_id, type, project_id, task_id, message_preview, sender_name, message_id, urgent)
    VALUES (rec.profile_id, 'task_message', proj_id, NEW.task_id, preview, sndr_name, NEW.id, NEW.urgent);
  END LOOP;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- notify_preprod_message: + urgent = NEW.urgent i begge grenene
-- (127 sin versjon inkluderer ikke message_id — beholdt som den var)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_preprod_message()
RETURNS TRIGGER AS $$
DECLARE
  rec       RECORD;
  preview   TEXT;
  lead      UUID;
  sndr_name TEXT;
BEGIN
  preview := left(NEW.message, 80);
  SELECT COALESCE(name, email, 'Ukjent') INTO sndr_name FROM profiles WHERE id = NEW.user_id;

  FOR rec IN
    SELECT DISTINCT m AS profile_id
    FROM unnest(NEW.mentions) AS m
    WHERE m != NEW.user_id
  LOOP
    INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name, urgent)
    VALUES (rec.profile_id, 'preprod_mention', NEW.project_id, preview, sndr_name, NEW.urgent);
  END LOOP;

  SELECT project_lead_id INTO lead FROM projects WHERE id = NEW.project_id;
  IF lead IS NOT NULL AND lead != NEW.user_id AND lead != ALL(NEW.mentions) THEN
    INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name, urgent)
    VALUES (lead, 'preprod_message', NEW.project_id, preview, sndr_name, NEW.urgent);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
