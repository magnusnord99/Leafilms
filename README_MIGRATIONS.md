# Database Migrations

Dette prosjektet har flere måter å kjøre database migrations på.

## Metode 1: Supabase CLI (Anbefalt)

### Alternativ A: Bruk npx (ingen installasjon nødvendig)

1. Logg inn i Supabase CLI (første gang):
```bash
npx supabase login
```
Dette åpner en nettleser hvor du logger inn med Supabase-kontoen din.

2. Link til ditt Supabase prosjekt:
```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```
(Du finner project-ref i Supabase Dashboard > Settings > General)

3. Kjør migrations:
```bash
npm run migrate:supabase
```
Eller:
```bash
npx supabase db push
```

### Alternativ B: Installer globalt (krever sudo)

Hvis du vil installere globalt:
```bash
sudo npm install -g supabase
```

Eller bruk Homebrew (anbefalt på macOS):
```bash
brew install supabase/tap/supabase
```

## Metode 2: psql (Hvis du har DATABASE_URL)

1. Legg til DATABASE_URL i `.env.local`:
```
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres
```
(Du finner connection string i Supabase Dashboard > Settings > Database)

2. Kjør migrations:
```bash
npm run migrate:psql
```

Eller manuelt:
```bash
./scripts/run-migrations-psql.sh
```

## Metode 3: TypeScript Script (Viser SQL)

Kjør scriptet som viser SQL-koden:
```bash
npm run migrate
```

Dette vil vise alle SQL-filer som kan kopieres til Supabase SQL Editor.

## Metode 4: Manuelt i Supabase Dashboard

1. Gå til Supabase Dashboard > SQL Editor
2. Kopier innholdet fra hver `.sql` fil i `database-migrations/`
3. Kjør SQL-en

## Migrations filer

Alle migrations ligger i `database-migrations/` og er nummerert:
- `003_ai_examples.sql`
- `004_case_studies.sql`
- `006_reorder_sections.sql`
- `007_image_library.sql`
- `008_create_storage_bucket.sql`
- `009_background_image_position.sql`

Migrations kjøres automatisk i rekkefølge basert på filnavnet.

