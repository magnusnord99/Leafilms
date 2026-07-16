-- Gjør det mulig å plassere en video-review inni et spesifikt bilde-album,
-- slik at et grovklipp kan ligge sammen med bildene fra samme opptak.
-- Videoer uten album_id (kun gallery_id) fortsetter å vises på galleriets toppnivå som i dag.
ALTER TABLE video_reviews ADD COLUMN IF NOT EXISTS album_id UUID REFERENCES selection_albums(id) ON DELETE SET NULL;
