-- 166_project_team_members.sql
--
-- Feedback 706674ff: når en kollega oppretter et prosjekt er det ingen måte å
-- få resten av teamet til å motta varsler om det — prosjektmeldinger faller i
-- dag kun tilbake til project_lead_id (og bare hvis ingen task_assignees
-- finnes ennå, se 082/099/138). Legger til en egen many-til-mange "prosjektteam"
-- (mønster kopiert fra task_assignees, 047/153) som er uavhengig av
-- oppgavetildeling og pipeline-steg, og utvider melding-varslingen til å
-- falle tilbake på teamet i tillegg til prosjektlederen.

CREATE TABLE IF NOT EXISTS project_team_members (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_project_team_members_project_id ON project_team_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_team_members_profile_id ON project_team_members(profile_id);

COMMENT ON TABLE project_team_members IS 'Mange-til-mange: hvilke brukere som er på teamet til et prosjekt (for varsler), uavhengig av task_assignees';

ALTER TABLE project_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read project_team_members"
  ON project_team_members FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Authenticated users can insert project_team_members"
  ON project_team_members FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Authenticated users can delete project_team_members"
  ON project_team_members FOR DELETE
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- ---------------------------------------------------------------------------
-- notify_project_message: fallback-grenen varslet tidligere kun project_lead_id
-- når ingen mentions/task_assignees fantes. Utvider til også å varsle
-- project_team_members (ekskl. avsender), i tillegg til lederen. Mentions- og
-- task_assignees-grenene er uendret (hentet fra 138_notification_urgency.sql,
-- siste kjente versjon).
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
    FOR rec IN
      SELECT DISTINCT ptm.profile_id
      FROM project_team_members ptm
      WHERE ptm.project_id = NEW.project_id
        AND ptm.profile_id != NEW.user_id
        AND ptm.profile_id != ALL(NEW.mentions)
    LOOP
      notified := true;
      INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name, message_id, urgent)
      VALUES (rec.profile_id, 'project_message', NEW.project_id, preview, COALESCE(NEW.user_name, 'Ukjent'), NEW.id, NEW.urgent);
    END LOOP;

    SELECT project_lead_id INTO lead_id FROM projects WHERE id = NEW.project_id;
    IF lead_id IS NOT NULL
       AND lead_id != NEW.user_id
       AND NOT EXISTS (SELECT 1 FROM project_team_members WHERE project_id = NEW.project_id AND profile_id = lead_id)
    THEN
      INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name, message_id, urgent)
      VALUES (lead_id, 'project_message', NEW.project_id, preview, COALESCE(NEW.user_name, 'Ukjent'), NEW.id, NEW.urgent);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- notify_preprod_message: samme utvidelse — teamet varsles i tillegg til
-- lederen (hentet fra 138_notification_urgency.sql, siste kjente versjon).
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

  FOR rec IN
    SELECT DISTINCT ptm.profile_id
    FROM project_team_members ptm
    WHERE ptm.project_id = NEW.project_id
      AND ptm.profile_id != NEW.user_id
      AND ptm.profile_id != ALL(NEW.mentions)
  LOOP
    INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name, urgent)
    VALUES (rec.profile_id, 'preprod_message', NEW.project_id, preview, sndr_name, NEW.urgent);
  END LOOP;

  SELECT project_lead_id INTO lead FROM projects WHERE id = NEW.project_id;
  IF lead IS NOT NULL
     AND lead != NEW.user_id
     AND lead != ALL(NEW.mentions)
     AND NOT EXISTS (SELECT 1 FROM project_team_members WHERE project_id = NEW.project_id AND profile_id = lead)
  THEN
    INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name, urgent)
    VALUES (lead, 'preprod_message', NEW.project_id, preview, sndr_name, NEW.urgent);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
