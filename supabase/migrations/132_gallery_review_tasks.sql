-- 132_gallery_review_tasks.sql
-- Kobler en gallery_reviews-runde til en admin_tasks-oppgave, slik at "Send til
-- review" legger seg som en oppgave (med frist) hos reviewer, og oppgaven
-- markeres ferdig automatisk når reviewer svarer (godkjenner eller ber om
-- endringer). admin_tasks brukes fremfor prosjekt-tasks siden gallerier kan
-- være uten prosjekt (samme begrunnelse som 108_admin_tasks.sql).

ALTER TABLE gallery_reviews ADD COLUMN IF NOT EXISTS admin_task_id UUID REFERENCES admin_tasks(id) ON DELETE SET NULL;
