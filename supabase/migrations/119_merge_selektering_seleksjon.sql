-- 119_merge_selektering_seleksjon.sql
-- Slår sammen "Selektering" og "Seleksjon til kunde" til ett steg ("Selektering")
-- i foto-post-prod-flyten. Begge var i praksis samme arbeid: gå gjennom bildene og
-- sende utvalget til kunden — "Seleksjon til kunde" har allerede UI-koblingen til
-- seleksjonsgalleriet, den flyttes til det overlevende "Selektering"-steget i koden.
--
-- Rydder også bort ubrukte project_type='mixed'-rader i task_templates:
-- seedMixedPostProdTasks() henter fotosporet for mixed-prosjekter fra
-- project_type='photo'-maler (ikke 'mixed'), så disse radene har aldri blitt brukt
-- av gjeldende seeding-logikk. Det betyr at sammenslåingen under påvirker fotosporet
-- i mixed-prosjekter også, siden de deler samme maler som rene photo-prosjekter.

-- ---------------------------------------------------------------------------
-- 1. Fjern ubrukte 'mixed'-maler
-- ---------------------------------------------------------------------------
DELETE FROM task_templates WHERE pipeline_stage = 'post_prod' AND project_type = 'mixed';

-- ---------------------------------------------------------------------------
-- 2. Slå sammen photo-malene: behold "Selektering", fjern "Seleksjon til kunde"
-- ---------------------------------------------------------------------------
UPDATE task_templates
SET description = 'Gå gjennom bildene, last opp beste utvalg og send seleksjonslink til kunden',
    sort_order = 0
WHERE pipeline_stage = 'post_prod' AND project_type = 'photo' AND title = 'Selektering';

DELETE FROM task_templates
WHERE pipeline_stage = 'post_prod' AND project_type = 'photo' AND title = 'Seleksjon til kunde';

UPDATE task_templates SET sort_order = 1 WHERE pipeline_stage = 'post_prod' AND project_type = 'photo' AND title = 'Redigering';
UPDATE task_templates SET sort_order = 2 WHERE pipeline_stage = 'post_prod' AND project_type = 'photo' AND title = 'Venter på tilbakemelding';
UPDATE task_templates SET sort_order = 3 WHERE pipeline_stage = 'post_prod' AND project_type = 'photo' AND title = 'Revisjoner';
UPDATE task_templates SET sort_order = 4 WHERE pipeline_stage = 'post_prod' AND project_type = 'photo' AND title = 'Ferdig';

-- ---------------------------------------------------------------------------
-- 3. Slå sammen eksisterende tasks på live prosjekter, gruppert per (project_id, sub_type)
--    Status-regel:
--      - begge steg finnes og begge er "done"           -> done
--      - begge steg finnes og kun ett er "done"          -> todo (ekte konflikt, manuell gjennomgang)
--      - kun ett steg finnes og det er "done"             -> done
--      - ellers, om noen er "in_progress"                 -> in_progress
--      - ellers                                            -> todo
-- ---------------------------------------------------------------------------
WITH candidates AS (
  SELECT id, project_id, sub_type, title, status,
         ROW_NUMBER() OVER (
           PARTITION BY project_id, sub_type
           ORDER BY (title = 'Selektering') DESC, sort_order ASC, id ASC
         ) AS rn
  FROM tasks
  WHERE pipeline_stage = 'post_prod' AND title IN ('Selektering', 'Seleksjon til kunde')
),
groups AS (
  SELECT project_id, sub_type,
         bool_or(title = 'Selektering') AS has_sel,
         bool_or(title = 'Seleksjon til kunde') AS has_kunde,
         bool_or(title = 'Selektering' AND status = 'done') AS sel_done,
         bool_or(title = 'Seleksjon til kunde' AND status = 'done') AS kunde_done,
         bool_or(status = 'done') AS any_done,
         bool_or(status = 'in_progress') AS any_in_progress
  FROM candidates
  GROUP BY project_id, sub_type
),
merged AS (
  SELECT project_id, sub_type,
    CASE
      WHEN has_sel AND has_kunde AND sel_done AND kunde_done THEN 'done'
      WHEN has_sel AND has_kunde AND sel_done <> kunde_done  THEN 'todo'
      WHEN any_done                                          THEN 'done'
      WHEN any_in_progress                                   THEN 'in_progress'
      ELSE 'todo'
    END AS new_status
  FROM groups
),
survivors AS (
  SELECT c.id, m.new_status
  FROM candidates c
  JOIN merged m ON m.project_id = c.project_id AND m.sub_type IS NOT DISTINCT FROM c.sub_type
  WHERE c.rn = 1
)
UPDATE tasks t
SET title = 'Selektering',
    description = 'Gå gjennom bildene, last opp beste utvalg og send seleksjonslink til kunden',
    status = s.new_status
FROM survivors s
WHERE t.id = s.id;

-- Slett de ikke-overlevende radene (duplikater / det tapende steget per gruppe)
WITH candidates AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY project_id, sub_type
           ORDER BY (title = 'Selektering') DESC, sort_order ASC, id ASC
         ) AS rn
  FROM tasks
  WHERE pipeline_stage = 'post_prod' AND title IN ('Selektering', 'Seleksjon til kunde')
)
DELETE FROM tasks WHERE id IN (SELECT id FROM candidates WHERE rn > 1);

-- ---------------------------------------------------------------------------
-- 4. Kompakter sort_order for de berørte (project_id, sub_type)-gruppene,
--    slik at det ikke blir hull etter det fjernede steget.
-- ---------------------------------------------------------------------------
WITH affected AS (
  SELECT DISTINCT project_id, sub_type
  FROM tasks
  WHERE pipeline_stage = 'post_prod' AND title = 'Selektering'
),
ranked AS (
  SELECT t.id,
         ROW_NUMBER() OVER (PARTITION BY t.project_id, t.sub_type ORDER BY t.sort_order, t.id) - 1 AS new_order
  FROM tasks t
  JOIN affected a ON a.project_id = t.project_id AND a.sub_type IS NOT DISTINCT FROM t.sub_type
  WHERE t.pipeline_stage = 'post_prod'
)
UPDATE tasks t SET sort_order = r.new_order
FROM ranked r
WHERE t.id = r.id AND t.sort_order <> r.new_order;
