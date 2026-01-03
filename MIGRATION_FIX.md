# Fix Migration History Mismatch

## Problem
CLI-en sier: "Remote migration versions not found in local migrations directory"

Dette betyr at remote database har migrasjoner registrert med et annet format (sannsynligvis hash/timestamp) enn det lokale filnavnene.

## Løsning: Bruk `supabase migration repair`

CLI-en har allerede gitt deg den riktige kommandoen! Kjør denne:

```bash
supabase migration repair --status reverted 003_ai_examples 004_case_studies 007_image_library 008_create_storage_bucket 009_background_image_position 010_team_members 011_add_updated_at_to_section_images 012_collage_presets 013_project_metadata 014_customers_and_projects 015_add_pdf_path_to_quotes 016_auth_setup 017_fix_profiles_rls 018_project_analytics 019_enable_rls_all_tables
```

Dette markerer alle disse migrasjonene som "reverted" i remote database, slik at CLI-en kan behandle dem på nytt.

## Deretter: Hent remote migrasjoner

```bash
supabase db pull
```

Dette henter remote migrasjoner og oppdaterer lokale filer.

## Til slutt: Push nye migrasjoner

```bash
supabase db push
```

Dette skal nå fungere uten feil.

## Alternativ: Ignorer og start på nytt

Hvis du ikke bryr deg om historikken, kan du:

1. Slett alle entries fra `supabase_migrations.schema_migrations` via SQL Editor
2. Kjør `supabase db pull` for å hente remote schema
3. Bruk CLI for alle fremtidige migrasjoner

## Hvorfor skjedde dette?

Supabase CLI bruker hash/timestamp-baserte versjonsnumre, ikke bare filnavn. Når du kjører migrasjoner manuelt, blir de registrert med et annet format enn det CLI-en forventer.

