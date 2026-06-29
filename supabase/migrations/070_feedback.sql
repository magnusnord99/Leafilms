create table if not exists feedback (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('bug', 'wish')),
  message     text not null,
  page_url    text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz default now()
);

alter table feedback enable row level security;

create policy "admins_all_feedback" on feedback
  for all using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );
