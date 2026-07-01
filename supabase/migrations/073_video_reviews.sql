-- Video Reviews: tidsankrede kommentarer på video fra kunder

-- ── Tabeller ─────────────────────────────────────────────────────────────────

create table if not exists video_reviews (
  id               uuid        primary key default gen_random_uuid(),
  project_id       uuid        references projects(id) on delete cascade not null,
  title            text        not null,
  storage_path     text        not null,
  duration_seconds float,
  token            text        unique not null,
  pin_code         text        not null,
  status           text        not null default 'open'
                               check (status in ('open', 'submitted')),
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create table if not exists video_comments (
  id                uuid        primary key default gen_random_uuid(),
  review_id         uuid        references video_reviews(id) on delete cascade not null,
  timestamp_seconds float,                      -- null = generell kommentar
  text              text        not null,
  author_name       text,
  resolved          boolean     not null default false,
  created_at        timestamptz default now()
);

-- ── Indekser ──────────────────────────────────────────────────────────────────

create index on video_reviews (project_id);
create index on video_reviews (token);
create index on video_comments (review_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table video_reviews enable row level security;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'video_reviews' AND policyname = 'service_all'
  ) THEN
    EXECUTE 'CREATE POLICY "service_all" ON video_reviews FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END$$;

alter table video_comments enable row level security;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'video_comments' AND policyname = 'service_all'
  ) THEN
    EXECUTE 'CREATE POLICY "service_all" ON video_comments FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END$$;

-- ── Storage bucket: videos ────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'videos',
  'videos',
  false,
  2147483648,  -- 2 GB
  array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo']
)
on conflict (id) do nothing;

-- Autentiserte brukere kan laste opp
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'auth_upload_videos'
  ) THEN
    EXECUTE 'CREATE POLICY "auth_upload_videos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = ''videos'')';
  END IF;
END$$;

-- Service role kan lese (for signerte URLer)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'service_read_videos'
  ) THEN
    EXECUTE 'CREATE POLICY "service_read_videos" ON storage.objects FOR SELECT TO service_role USING (bucket_id = ''videos'')';
  END IF;
END$$;
