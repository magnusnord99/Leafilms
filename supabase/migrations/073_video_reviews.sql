-- Video Reviews: tidsankrede kommentarer på video fra kunder

-- ── Tabeller ─────────────────────────────────────────────────────────────────

create table video_reviews (
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

create table video_comments (
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
create policy "service_all" on video_reviews
  for all to service_role using (true) with check (true);

alter table video_comments enable row level security;
create policy "service_all" on video_comments
  for all to service_role using (true) with check (true);

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
create policy "auth_upload_videos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'videos');

-- Service role kan lese (for signerte URLer)
create policy "service_read_videos" on storage.objects
  for select to service_role
  using (bucket_id = 'videos');
