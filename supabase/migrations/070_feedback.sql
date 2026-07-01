create table if not exists feedback (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('bug', 'wish')),
  message     text not null,
  page_url    text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz default now()
);

alter table feedback enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'feedback' AND policyname = 'admins_all_feedback'
  ) THEN
    EXECUTE 'CREATE POLICY "admins_all_feedback" ON feedback FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ''admin''))';
  END IF;
END$$;
