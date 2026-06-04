-- 055_lost_projects.sql
alter table projects
  add column if not exists lost_reason  text,
  add column if not exists lost_notes   text,
  add column if not exists lost_at      timestamptz,
  add column if not exists lost_stage   text;
