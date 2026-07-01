-- Leveranser: stor-fil-overføring til kunder
-- Erstatter ekstern tjeneste (Filemail)

create table if not exists transfers (
  id              uuid primary key default gen_random_uuid(),
  created_by      uuid references auth.users(id) on delete set null,
  r2_key          text not null,                -- sti i R2-bucket (settes etter opplasting)
  filename        text not null,
  filesize_bytes  bigint not null default 0,
  content_type    text,
  title           text,                         -- valgfritt visningsnavn
  message         text,                         -- valgfri melding til mottaker
  password_hash   text,                         -- bcrypt-hash, null = ingen passord
  expires_at      timestamptz,
  max_downloads   int,                          -- null = ubegrenset
  download_count  int not null default 0,
  status          text not null default 'active' check (status in ('active', 'expired', 'deleted')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists transfer_links (
  id              uuid primary key default gen_random_uuid(),
  transfer_id     uuid not null references transfers(id) on delete cascade,
  token           text not null unique,         -- tilfeldig 32-byte hex
  recipient_email text,
  recipient_name  text,
  created_at      timestamptz not null default now()
);

-- Indekser
create index if not exists transfers_created_by_idx on transfers(created_by);
create index if not exists transfers_status_idx on transfers(status);
create index if not exists transfer_links_token_idx on transfer_links(token);
create index if not exists transfer_links_transfer_id_idx on transfer_links(transfer_id);

-- updated_at trigger
create or replace function update_transfers_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists transfers_updated_at on transfers;
create trigger transfers_updated_at
  before update on transfers
  for each row execute function update_transfers_updated_at();

-- RLS
alter table transfers enable row level security;
alter table transfer_links enable row level security;

-- Kun innloggede admins kan se alle leveranser
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'transfers' AND policyname = 'Admin kan se alle leveranser') THEN
    EXECUTE 'CREATE POLICY "Admin kan se alle leveranser" ON transfers FOR SELECT USING (auth.uid() is not null)';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'transfers' AND policyname = 'Admin kan opprette leveranser') THEN
    EXECUTE 'CREATE POLICY "Admin kan opprette leveranser" ON transfers FOR INSERT WITH CHECK (auth.uid() is not null)';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'transfers' AND policyname = 'Admin kan oppdatere egne leveranser') THEN
    EXECUTE 'CREATE POLICY "Admin kan oppdatere egne leveranser" ON transfers FOR UPDATE USING (auth.uid() is not null)';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'transfers' AND policyname = 'Admin kan slette egne leveranser') THEN
    EXECUTE 'CREATE POLICY "Admin kan slette egne leveranser" ON transfers FOR DELETE USING (auth.uid() = created_by)';
  END IF;
END$$;

-- Transfer links: admin kan administrere, anon kan lese via token
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'transfer_links' AND policyname = 'Admin kan se alle lenker') THEN
    EXECUTE 'CREATE POLICY "Admin kan se alle lenker" ON transfer_links FOR SELECT USING (auth.uid() is not null)';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'transfer_links' AND policyname = 'Admin kan opprette lenker') THEN
    EXECUTE 'CREATE POLICY "Admin kan opprette lenker" ON transfer_links FOR INSERT WITH CHECK (auth.uid() is not null)';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'transfer_links' AND policyname = 'Anon kan lese lenke via token') THEN
    EXECUTE 'CREATE POLICY "Anon kan lese lenke via token" ON transfer_links FOR SELECT USING (true)';
  END IF;
END$$;
