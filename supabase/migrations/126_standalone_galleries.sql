-- 126_standalone_galleries.sql
-- Gjør gallerier (bilde-seleksjon + video-review) uavhengige av prosjekt.
-- Et galleri kan opprettes fritt og knyttes til (eller løsrives fra) et
-- prosjekt i etterkant. Prosjekt-slettes-kaskaden beholdes uendret.

ALTER TABLE selection_galleries ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE video_reviews ALTER COLUMN project_id DROP NOT NULL;
