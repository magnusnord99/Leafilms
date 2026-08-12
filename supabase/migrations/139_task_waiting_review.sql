-- 139_task_waiting_review.sql
-- Ny tasks.status-verdi 'waiting_review': settes automatisk på postprod-steget
-- (Selektering/Redigering) når bildene i det sendes til kollega-review, og
-- tilbakestilles til 'in_progress' automatisk når kollegaen svarer — se
-- requestGalleryReview/respondToGalleryReview i lib/actions/gallery-reviews.ts.

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('todo', 'in_progress', 'done', 'waiting_review'));

-- Husker hvilket postprod-steg en review-runde ble sendt fra, slik at svaret kan
-- tilbakestille nøyaktig det steget uten å gjette ut fra tittel på nytt.
ALTER TABLE gallery_reviews ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
