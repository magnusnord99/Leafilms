alter table feedback
  add column if not exists priority int not null default 2 check (priority in (1, 2, 3)),
  add column if not exists status text not null default 'open' check (status in ('open', 'in_progress', 'resolved'));
