# Database Migrations Guide

Dette prosjektet bruker SQL-migrasjoner for å oppdatere databasestrukturen. Migrasjonene ligger i `database-migrations/` mappen.

## Hurtigstart

### Metode 1: Direkte database-tilkobling (Enklest)

1. **Hent connection string fra Supabase:**
   - Gå til Supabase Dashboard → Settings → Database
   - Under "Connection string" → "URI" → Kopier connection string
   - Format: `postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres`

2. **Legg til i `.env.local`:**
   ```bash
   DATABASE_URL=postgresql://postgres:your-password@db.fmwcrgfxmlgfnsinnuyy.supabase.co:5432/postgres
   ```

3. **Kjør migrasjoner:**
   ```bash
   npm run migrate
   ```

### Metode 2: Supabase CLI (Anbefalt for produksjon)

1. **Link prosjektet:**
   ```bash
   npx supabase link --project-ref fmwcrgfxmlgfnsinnuyy
   ```
   (Project ref finner du i Supabase Dashboard → Settings → General)

2. **Kjør migrasjoner:**
   ```bash
   npm run migrate
   ```

### Metode 3: Manuell (Hvis ingenting annet fungerer)

1. **Vis alle migrasjoner:**
   ```bash
   npm run migrate:show
   ```

2. **Kopier SQL fra output og lim inn i:**
   - Supabase Dashboard → SQL Editor
   - Kjør hver migrasjon en om gangen

## Migrasjonsfiler

Migrasjonene er nummerert og kjøres i rekkefølge:
- `003_ai_examples.sql`
- `004_case_studies.sql`
- ...
- `016_auth_setup.sql` (nyeste)

## Feilsøking

**"DATABASE_URL not found"**
- Sjekk at `.env.local` eksisterer og inneholder `DATABASE_URL`
- Passordet i connection string må være URL-encoded hvis det inneholder spesialtegn

**"psql: command not found"**
- Installer PostgreSQL client tools
- macOS: `brew install postgresql`
- Linux: `sudo apt-get install postgresql-client`

**"Supabase project not linked"**
- Kjør `npx supabase link --project-ref YOUR_PROJECT_REF`
- Eller bruk Metode 1 (direkte database-tilkobling) i stedet

## Nye migrasjoner

Når du lager nye migrasjoner:
1. Navngi filen: `017_description.sql` (neste nummer)
2. Plasser i `database-migrations/` mappen
3. Kjør `npm run migrate` for å kjøre den

