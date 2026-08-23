-- Migration 040: Project Management System
-- Legger til pipeline-steg på projects, tasks, task_templates, leads og email_log

-- ============================================
-- 1. PIPELINE STAGE PÅ PROJECTS
-- ============================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS pipeline_stage TEXT NOT NULL DEFAULT 'lead'
    CHECK (pipeline_stage IN (
      'lead', 'møte', 'tilbud_sendt', 'kontrakt',
      'pre_prod', 'produksjon', 'post_prod',
      'levering', 'fakturert', 'videresalg'
    ));

CREATE INDEX IF NOT EXISTS idx_projects_pipeline_stage ON projects(pipeline_stage);

-- ============================================
-- 2. TABELL: tasks
-- ============================================

CREATE TABLE IF NOT EXISTS tasks (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  pipeline_stage TEXT        NOT NULL
    CHECK (pipeline_stage IN (
      'lead', 'møte', 'tilbud_sendt', 'kontrakt',
      'pre_prod', 'produksjon', 'post_prod',
      'levering', 'fakturert', 'videresalg'
    )),
  title          TEXT        NOT NULL,
  description    TEXT,
  assignee_id    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  due_date       DATE,
  status         TEXT        NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'in_progress', 'done')),
  priority       TEXT
    CHECK (priority IN ('low', 'medium', 'high')),
  sort_order     INT         NOT NULL DEFAULT 0,
  created_by     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_project_id       ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_pipeline_stage   ON tasks(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id      ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status           ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_sort_order       ON tasks(project_id, pipeline_stage, sort_order);

COMMENT ON TABLE tasks IS 'Oppgaver knyttet til prosjekter, organisert per pipeline-steg';

-- ============================================
-- 3. TABELL: task_templates
-- ============================================

CREATE TABLE IF NOT EXISTS task_templates (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_stage TEXT        NOT NULL
    CHECK (pipeline_stage IN (
      'lead', 'møte', 'tilbud_sendt', 'kontrakt',
      'pre_prod', 'produksjon', 'post_prod',
      'levering', 'fakturert', 'videresalg'
    )),
  title          TEXT        NOT NULL,
  description    TEXT,
  sort_order     INT         NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_templates_pipeline_stage ON task_templates(pipeline_stage, sort_order);

COMMENT ON TABLE task_templates IS 'Faste oppgavemaler per pipeline-steg — opprettes automatisk ved stegbytte';

-- ============================================
-- 4. TABELL: leads
-- ============================================

CREATE TABLE IF NOT EXISTS leads (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT        NOT NULL,
  company                 TEXT,
  email                   TEXT,
  phone                   TEXT,
  source                  TEXT,
  status                  TEXT        NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'meeting_booked', 'converted', 'lost')),
  notes                   TEXT,
  assigned_to             UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  converted_to_project_id UUID        REFERENCES projects(id) ON DELETE SET NULL,
  created_by              UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_status           ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to      ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_converted_to_project_id ON leads(converted_to_project_id);

COMMENT ON TABLE leads IS 'CRM for potensielle kunder før de blir prosjekter';
COMMENT ON COLUMN leads.source IS 'Kanal leaden kom fra, f.eks. nettside, Instagram, LinkedIn, referanse';
COMMENT ON COLUMN leads.converted_to_project_id IS 'Settes når leaden konverteres til et prosjekt';

-- ============================================
-- 5. TABELL: email_log
-- ============================================

CREATE TABLE IF NOT EXISTS email_log (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID        REFERENCES projects(id) ON DELETE SET NULL,
  lead_id           UUID        REFERENCES leads(id) ON DELETE SET NULL,
  to_email          TEXT        NOT NULL,
  subject           TEXT        NOT NULL,
  body_html         TEXT,
  sent_by           UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  resend_message_id TEXT,
  type              TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_log_project_id ON email_log(project_id);
CREATE INDEX IF NOT EXISTS idx_email_log_lead_id    ON email_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_log_sent_at    ON email_log(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_type       ON email_log(type);

COMMENT ON TABLE email_log IS 'Logger alle e-poster sendt fra systemet via Resend';
COMMENT ON COLUMN email_log.type IS 'Type e-post, f.eks. pitch, videresalg, lead_outreach, kontrakt';
COMMENT ON COLUMN email_log.resend_message_id IS 'Meldings-ID returnert fra Resend API for sporing';

-- ============================================
-- 6. RLS PÅ ALLE NYE TABELLER
-- ============================================

-- tasks
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_tasks"   ON tasks;
DROP POLICY IF EXISTS "authenticated_insert_tasks" ON tasks;
DROP POLICY IF EXISTS "authenticated_update_tasks" ON tasks;
DROP POLICY IF EXISTS "authenticated_delete_tasks" ON tasks;

CREATE POLICY "authenticated_read_tasks"
  ON tasks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_tasks"
  ON tasks FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_tasks"
  ON tasks FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_tasks"
  ON tasks FOR DELETE
  TO authenticated
  USING (true);

-- task_templates
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_task_templates"   ON task_templates;
DROP POLICY IF EXISTS "authenticated_insert_task_templates" ON task_templates;
DROP POLICY IF EXISTS "authenticated_update_task_templates" ON task_templates;
DROP POLICY IF EXISTS "authenticated_delete_task_templates" ON task_templates;

CREATE POLICY "authenticated_read_task_templates"
  ON task_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_task_templates"
  ON task_templates FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_task_templates"
  ON task_templates FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_task_templates"
  ON task_templates FOR DELETE
  TO authenticated
  USING (true);

-- leads
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_leads"   ON leads;
DROP POLICY IF EXISTS "authenticated_insert_leads" ON leads;
DROP POLICY IF EXISTS "authenticated_update_leads" ON leads;
DROP POLICY IF EXISTS "authenticated_delete_leads" ON leads;

-- Staff-only: customer JWTs must not read or wipe the CRM / outbound
-- email archive via PostgREST. 040 runs before is_staff() (097), so
-- the role check is inline.
CREATE POLICY "authenticated_read_leads"
  ON leads FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales', 'production')
    )
  );

CREATE POLICY "authenticated_insert_leads"
  ON leads FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales', 'production')
    )
  );

CREATE POLICY "authenticated_update_leads"
  ON leads FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales', 'production')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales', 'production')
    )
  );

CREATE POLICY "authenticated_delete_leads"
  ON leads FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales', 'production')
    )
  );

-- email_log
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_email_log"   ON email_log;
DROP POLICY IF EXISTS "authenticated_insert_email_log" ON email_log;
DROP POLICY IF EXISTS "authenticated_update_email_log" ON email_log;
DROP POLICY IF EXISTS "authenticated_delete_email_log" ON email_log;

CREATE POLICY "authenticated_read_email_log"
  ON email_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales', 'production')
    )
  );

CREATE POLICY "authenticated_insert_email_log"
  ON email_log FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales', 'production')
    )
  );

CREATE POLICY "authenticated_update_email_log"
  ON email_log FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales', 'production')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales', 'production')
    )
  );

CREATE POLICY "authenticated_delete_email_log"
  ON email_log FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales', 'production')
    )
  );

-- ============================================
-- 7. SEED: STANDARD TASK_TEMPLATES
-- ============================================

INSERT INTO task_templates (pipeline_stage, title, description, sort_order) VALUES

  -- lead
  ('lead', 'Logg første kontakt',  'Noter hvem som tok kontakt, kanal og dato',            1),
  ('lead', 'Kvalifiser lead',      'Vurder behov, budsjett og timing — er det en god match?', 2),

  -- møte
  ('møte', 'Forbered møteagenda',  'Lag en agenda med punkter og mål for møtet',           1),
  ('møte', 'Gjennomfør møte',      'Avhold møtet og noter ned viktige punkter',            2),
  ('møte', 'Send møtereferat',     'Send et kort referat med oppfølgingspunkter til kunden', 3),

  -- tilbud_sendt
  ('tilbud_sendt', 'Lag prosjektbeskrivelse',              'Skriv en beskrivelse av leveransen og omfanget',          1),
  ('tilbud_sendt', 'Sett opp priser i tilbud',             'Fyll inn priser og timerate i tilbudsskjemaet',           2),
  ('tilbud_sendt', 'Publiser og send tilbud til kunde',    'Generer tilbuds-PDF og send det til kunden for godkjenning', 3),

  -- kontrakt
  ('kontrakt', 'Send kontrakt til signering', 'Generer og send kontrakt via signeringstjenesten',  1),
  ('kontrakt', 'Motta signert kontrakt',      'Bekreft at signert kontrakt er mottatt og arkivert', 2),

  -- pre_prod
  ('pre_prod', 'Opprett produksjonsplan', 'Sett opp tidsplan med milepæler og deadlines',  1),
  ('pre_prod', 'Book utstyr og lokasjon', 'Reserver kamera, lys, lyd og opptakslokasjon', 2),
  ('pre_prod', 'Brief teamet',            'Hold briefing med crew om konsept og logistikk', 3),

  -- produksjon
  ('produksjon', 'Gjennomfør innspilling',  'Gjennomfør planlagte opptaksdager',                   1),
  ('produksjon', 'Logg innspillingsdager',  'Dokumenter hva som ble spilt inn og eventuelle avvik', 2),

  -- post_prod
  ('post_prod', 'Redigering',                      'Klipp og sett sammen råmaterialet til et utkast',            1),
  ('post_prod', 'Lydmiks og fargekorreksjon',       'Korriger farger og miks lyden til leveransekvalitet',        2),
  ('post_prod', 'Kundegjennomgang og revisjon',     'Send utkast til kunde og håndter tilbakemeldinger og endringer', 3),

  -- levering
  ('levering', 'Lever ferdig materiale',           'Last opp og del det ferdige materialet med kunden',           1),
  ('levering', 'Innhent tilbakemelding fra kunde', 'Be om en vurdering og noter ned tilbakemeldinger for fremtiden', 2),

  -- fakturert
  ('fakturert', 'Send faktura',                'Generer og send faktura til kunden',             1),
  ('fakturert', 'Bekreft betaling mottatt',    'Sjekk at innbetaling er registrert og kvittert', 2),

  -- videresalg
  ('videresalg', 'Send oppfølgingsmail til kunde',  'Ta kontakt med kunden 3–6 måneder etter levering for nye prosjekter', 1),
  ('videresalg', 'Logg videresalgsmulighet',        'Noter eventuell interesse for nytt oppdrag eller referanse',           2);
