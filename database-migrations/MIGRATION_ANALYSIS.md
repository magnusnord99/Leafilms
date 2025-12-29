# Database Migration Analysis

## Migrasjoner som er nødvendige (brukes aktivt i appen):

### ✅ **003_ai_examples.sql** - NØDVENDIG
- Oppretter `ai_examples` tabell
- Brukes i: `/app/api/generate-text/route.ts`, `/app/admin/ai-examples/`
- **Behold denne**

### ✅ **004_case_studies.sql** - NØDVENDIG
- Oppretter `case_studies` og `section_case_studies` tabeller
- Brukes i: `/app/admin/cases/`, `/app/p/[token]/page.tsx`
- **Behold denne**

### ✅ **007_image_library.sql** - NØDVENDIG
- Oppretter `images` og `section_images` tabeller
- Brukes i: `/app/admin/images/`, `/app/admin/projects/[id]/edit/`
- **Behold denne**

### ✅ **008_create_storage_bucket.sql** - NØDVENDIG
- Oppretter Supabase Storage bucket `assets`
- Brukes for: Alle bilde-opplastinger
- **Behold denne** (men kan kjøres manuelt i Supabase Dashboard hvis nødvendig)

### ✅ **009_background_image_position.sql** - NØDVENDIG
- Legger til `background_position_x`, `background_position_y`, `background_zoom` i `section_images`
- Brukes i: `/app/admin/projects/[id]/edit/components/ImagePositionControls.tsx`
- **Behold denne**

### ✅ **010_team_members.sql** - NØDVENDIG
- Oppretter `team_members` og `section_team_members` tabeller
- Brukes i: `/app/admin/team/`, `/app/admin/projects/[id]/edit/components/TeamSection.tsx`
- **Behold denne**

### ✅ **011_add_updated_at_to_section_images.sql** - NØDVENDIG
- Legger til `updated_at` i `section_images`
- Brukes for: Tracking av endringer
- **Behold denne**

### ✅ **012_collage_presets.sql** - NØDVENDIG
- Oppretter `collage_presets`, `collage_preset_images`, `project_collage_images`
- Brukes i: `/app/admin/images/presets/`, `/app/admin/projects/[id]/edit/components/ExampleWorkSection.tsx`
- **Behold denne**

### ✅ **013_project_metadata.sql** - NØDVENDIG
- Legger til `metadata` JSONB kolonne i `projects`
- Brukes i: `/app/admin/projects/new/page.tsx`, `/app/api/generate-project/route.ts`
- **Behold denne**

### ✅ **014_customers_and_projects.sql** - NØDVENDIG
- Oppretter `customers`, `quotes`, `contracts` tabeller
- Legger til `customer_id` i `projects`
- Brukes i: Hele admin-systemet for kunder og tilbud
- **Behold denne**

### ✅ **015_add_pdf_path_to_quotes.sql** - NØDVENDIG
- Legger til `pdf_path` i `quotes`
- Brukes i: `/app/admin/customers/[id]/projects/page.tsx`
- **Behold denne**

### ✅ **016_auth_setup.sql** - NØDVENDIG
- Oppretter `profiles` tabell og RLS policies
- Brukes i: Hele autentiseringssystemet
- **Behold denne**

## Manglende migrasjoner (referert til, men ikke funnet):

### ⚠️ **001 eller 002** - MANGER
- Må inneholde opprettelse av `projects` og `sections` tabeller
- Disse tabellene brukes overalt i appen
- **Sjekk om disse finnes i Supabase Dashboard eller i en annen mappe**

## Anbefalinger:

1. **Alle migrasjoner er nødvendige** - ingen kan fjernes
2. **Sjekk for manglende migrasjoner** - `projects` og `sections` må være opprettet et sted
3. **Konsolidering** - Hvis du vil rydde opp, kan du:
   - Kombinere små migrasjoner (009, 011, 013, 015) til én fil
   - Men dette er ikke anbefalt hvis migrasjonene allerede er kjørt i produksjon

## Neste steg:

1. Sjekk om det finnes `001_` eller `002_` migrasjoner et annet sted
2. Hvis ikke, opprett en ny migrasjon som dokumenterer `projects` og `sections` strukturen
3. Vurder å konsolidere små migrasjoner hvis du starter på nytt (ikke hvis de allerede er kjørt)

