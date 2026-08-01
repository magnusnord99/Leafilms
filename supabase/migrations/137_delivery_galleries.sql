-- 137_delivery_galleries.sql
-- Leverings-galleri: samme struktur som seleksjons-galleriet, men brukt til at en
-- redigerer laster opp ferdigbehandlede bilder for at en kollega skal kunne se
-- gjennom og godkjenne før levering til kunde (via ekstern app — kunden ser aldri
-- dette galleriet i Leafilms). Gjenbruker eksisterende opplasting, album- og
-- gallery_reviews-flyt uendret — kun galleri-typen er ny.

ALTER TABLE selection_galleries
  ADD COLUMN IF NOT EXISTS gallery_type TEXT NOT NULL DEFAULT 'selection'
  CHECK (gallery_type IN ('selection', 'delivery'));

CREATE INDEX IF NOT EXISTS idx_selection_galleries_project_type
  ON selection_galleries(project_id, gallery_type);
