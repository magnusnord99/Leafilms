# Database Migrations

Dette er migrasjonene som har blitt kjørt for å sette opp databasestrukturen.

## Viktig

**Disse migrasjonene er allerede kjørt i produksjon.** Du trenger ikke å kjøre dem igjen med mindre du:
- Setter opp et nytt miljø (staging, dev, lokalt)
- Gjenoppretter databasen fra scratch
- Trenger dokumentasjon av databasestrukturen

## Migrasjonsoversikt

### Core Tables (mangler migrasjoner - sannsynligvis kjørt manuelt tidligere)
- `projects` - Hovedtabell for prosjekter
- `sections` - Seksjoner innenfor prosjekter

### 003_ai_examples.sql
- **Tabell:** `ai_examples`
- **Formål:** Lagrer eksempler for AI-generering av tekst
- **Brukes i:** `/app/api/generate-text/route.ts`, `/app/admin/ai-examples/`

### 004_case_studies.sql
- **Tabeller:** `case_studies`, `section_case_studies`
- **Formål:** Portfolio/case studies som kan brukes i prosjekter
- **Brukes i:** `/app/admin/cases/`, `/app/p/[token]/page.tsx`

### 007_image_library.sql
- **Tabeller:** `images`, `section_images`
- **Formål:** Globalt bildebibliotek og kobling til seksjoner
- **Brukes i:** `/app/admin/images/`, alle prosjekt-redigeringssider

### 008_create_storage_bucket.sql
- **Formål:** Oppretter Supabase Storage bucket `assets`
- **Merk:** Dette kan også gjøres manuelt i Supabase Dashboard
- **Brukes for:** Alle bilde-opplastinger

### 009_background_image_position.sql
- **Endring:** Legger til `background_position_x`, `background_position_y`, `background_zoom` i `section_images`
- **Formål:** Kontroll av bakgrunnsbilde-posisjon
- **Brukes i:** `/app/admin/projects/[id]/edit/components/ImagePositionControls.tsx`

### 010_team_members.sql
- **Tabeller:** `team_members`, `section_team_members`
- **Formål:** Team-medlemmer som kan vises i prosjekter
- **Brukes i:** `/app/admin/team/`, `/app/admin/projects/[id]/edit/components/TeamSection.tsx`

### 011_add_updated_at_to_section_images.sql
- **Endring:** Legger til `updated_at` i `section_images`
- **Formål:** Tracking av når bilder ble oppdatert

### 012_collage_presets.sql
- **Tabeller:** `collage_presets`, `collage_preset_images`, `project_collage_images`
- **Formål:** Forhåndsdefinerte collage-sett for "example work" seksjonen
- **Brukes i:** `/app/admin/images/presets/`, `/app/admin/projects/[id]/edit/components/ExampleWorkSection.tsx`

### 013_project_metadata.sql
- **Endring:** Legger til `metadata` JSONB kolonne i `projects`
- **Formål:** Lagrer AI-genereringsdata (project_type, medium, target_audience, etc.)
- **Brukes i:** `/app/admin/projects/new/page.tsx`, `/app/api/generate-project/route.ts`

### 014_customers_and_projects.sql
- **Tabeller:** `customers`, `quotes`, `contracts`
- **Endring:** Legger til `customer_id` i `projects`
- **Formål:** Kunde-struktur og tilbud/kontrakter
- **Brukes i:** Hele admin-systemet for kunder og tilbud

### 015_add_pdf_path_to_quotes.sql
- **Endring:** Legger til `pdf_path` i `quotes`
- **Formål:** Lagrer path til genererte PDF-filer
- **Brukes i:** `/app/admin/customers/[id]/projects/page.tsx`

### 016_auth_setup.sql
- **Tabell:** `profiles`
- **Formål:** Brukerprofiler knyttet til Supabase Auth
- **Brukes i:** Hele autentiseringssystemet

## Hvordan kjøre migrasjoner

Se `MIGRATIONS.md` i rot-mappen for instruksjoner.

## Nye migrasjoner

Når du lager nye migrasjoner:
1. Navngi filen: `017_description.sql` (neste nummer)
2. Plasser i `database-migrations/` mappen
3. Dokumenter hva den gjør i denne README-en

