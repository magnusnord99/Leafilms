-- Migration 046: sub_type-kolonne på tasks for "Begge"-prosjekter
-- Skiller mellom video- og fototasker i prosjekter med project_type='mixed'

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sub_type TEXT CHECK (sub_type IN ('video', 'photo'));

CREATE INDEX IF NOT EXISTS idx_tasks_sub_type ON tasks(project_id, pipeline_stage, sub_type);
