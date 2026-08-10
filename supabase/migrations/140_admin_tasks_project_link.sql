-- 140_admin_tasks_project_link.sql
-- admin_tasks manglet all prosjekttilknytning (jf. 108_admin_tasks.sql), noe som
-- var greit for genuint prosjektløse oppgaver, men "Gjennomgå bildeutvalg"-oppgaven
-- fra requestGalleryReview (lib/actions/gallery-reviews.ts) har nesten alltid et
-- kjent prosjekt — den trengte bare en synlig lenke, ikke en helt egen tabell.

ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_admin_tasks_project_id ON admin_tasks(project_id);
