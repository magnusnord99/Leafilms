-- 128_signed_deliverables.sql
-- Signert leveranse som fasit: strukturert liste over video-/foto-elementer,
-- fryst på contracts ved signering, med en levende kopi på projects som
-- post-prod og resten av systemet leser fra. Se
-- docs/superpowers/specs/2026-07-27-signed-deliverables-postprod-design.md

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS deliverables JSONB;
ALTER TABLE projects  ADD COLUMN IF NOT EXISTS deliverables JSONB;
ALTER TABLE tasks     ADD COLUMN IF NOT EXISTS deliverable_id TEXT;

ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS default_scope TEXT
  CHECK (default_scope IN ('shared', 'per_deliverable'));

-- Kun video-malene i post_prod-steget får en verdi — foto splittes aldri i
-- egne faner (avklart med Magnus), photo-maler forblir NULL/urørt.
UPDATE task_templates SET default_scope = 'shared'
WHERE pipeline_stage = 'post_prod' AND project_type = 'video' AND title IN ('Logging', 'Ferdig');

UPDATE task_templates SET default_scope = 'per_deliverable'
WHERE pipeline_stage = 'post_prod' AND project_type = 'video' AND title NOT IN ('Logging', 'Ferdig');
