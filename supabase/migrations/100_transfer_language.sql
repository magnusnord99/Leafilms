-- Språk for mottakeren av en leveranse — styrer den offentlige nedlastingssiden
-- (/d/[token]) og leverings-e-posten. Transfers har ingen prosjektkobling i DB,
-- så språket settes eksplisitt ved opprettelse (default fra prosjektet i admin-UI).
alter table transfers
  add column if not exists language text not null default 'no'
  check (language in ('no', 'en'));
