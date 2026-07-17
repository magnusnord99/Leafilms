-- Én kontraktmal per språk. Eksisterende mal er norsk (default 'no');
-- den engelske malen settes inn av admin/scripts etterpå. Malvalget i
-- lib/actions/contracts.ts velger mal etter project.language med norsk fallback.
alter table contract_templates
  add column if not exists language text not null default 'no'
  check (language in ('no', 'en'));

create unique index if not exists contract_templates_language_key
  on contract_templates(language);
