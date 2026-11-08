-- 182_admin_task_due_time.sql
-- Valgfritt klokkeslett i tillegg til due_date (som blir stående som ren dato, urørt,
-- for å ikke påvirke alt annet som allerede leser/sorterer på den i resten av admin_tasks).
-- Først brukt på intern-review-fristen i GalleryReviewPanel (feedback 6f68affe).

ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS due_time TIME;
