# Design: AI Chat-assistent (RAG) for Leafilms admin

**Dato:** 2026-06-29  
**Status:** Godkjent  
**Forfatter:** Claude Code

---

## Oversikt

En intern chat-bot som svarer på spørsmål om Leafilms-data — prosjekter, leads, priser, teamet og pipeline-status. Boten lever som en flytende chat-knapp tilgjengelig på alle admin-sider. Den er **read-only** og bruker **Text-to-SQL** som primær datahentingsmekanisme.

Arkitekturen er designet for å støtte **hybrid RAG** (vector search + SQL) i fase 2 uten omskriving.

---

## Brukstilfeller

- "Hva skal leveres på prosjekt X?"
- "Hva er status på dette prosjektet?"
- "Hva ble vi enige om i prisen?"
- "Hvor mange leads er i pipelinen?"
- "Hvilke tasks er tildelt Magnus?"
- "Hvilke prosjekter er i post_prod nå?"

---

## Arkitektur

### Flyt per spørsmål

```
Bruker skriver spørsmål
        ↓
POST /api/ai/chat
        ↓
Claude får:
  • System prompt med skjemabeskrivelse (norsk)
  • Samtalehistorikk (role/content[])
  • Registrerte retrievers som tools
        ↓
Claude kaller query_database({ sql: "SELECT ..." })
        ↓
SQL valideres (kun SELECT, maks 50 rader)
        ↓
Kjøres mot Supabase via service_role
        ↓
Claude formulerer norsk svar basert på resultatet
        ↓
Svaret streames tilbake til UI (ReadableStream)
```

### Retriever-abstraksjon (nøkkel for skalerbarhet)

Alle datakilder implementerer et felles interface:

```ts
interface Retriever {
  name: string           // Claude ser dette som verktøynavn
  description: string    // Claude bruker dette til å velge riktig verktøy
  schema: ZodSchema      // Input-validering
  execute(params: unknown): Promise<unknown>
}
```

Registeret i `lib/ai/retrievers/index.ts` er det eneste stedet som endres når nye retrievers legges til:

```ts
// Fase 1
export const retrievers: Retriever[] = [sqlRetriever]

// Fase 2 — én linje
export const retrievers: Retriever[] = [sqlRetriever, vectorRetriever]
```

---

## Komponenter

### `lib/ai/schema-context.ts`

Kompakt skjemabeskrivelse på norsk som sendes til Claude i system-prompten. Beskriver alle relevante tabeller med kolonner og gyldige enum-verdier. Oppdateres manuelt når nye tabeller legges til.

Tabeller som beskrives: `projects`, `customers`, `leads`, `tasks`, `task_assignees`, `profiles`, `quotes`, `team_members`, `project_messages`, `notifications`.

### `lib/ai/retrievers/sql.ts`

SQL-retriever. Validerer at spørringen er SELECT, setter maks 50 rader, kjører mot Supabase med `service_role`-klienten.

```ts
export const sqlRetriever: Retriever = {
  name: 'query_database',
  description: 'Kjør en SELECT-spørring mot Leafilms-databasen for å hente data',
  schema: z.object({ sql: z.string() }),
  async execute({ sql }) {
    if (!/^\s*SELECT\s/i.test(sql)) throw new Error('Kun SELECT tillatt')
    const { data, error } = await supabaseAdmin
      .rpc('execute_readonly_query', { query: sql })
    if (error) throw error
    return { rows: data, count: data?.length ?? 0 }
  }
}
```

### `lib/ai/retrievers/index.ts`

Retriever-register. Eksporterer listen som brukes av `chat.ts`.

### `lib/ai/chat.ts`

Orkestrerings-funksjonen. Tar `messages` og `retrievers`, bygger system-prompt, kaller Claude med tool use, håndterer tool-kall i en loop til Claude er ferdig, returnerer en `ReadableStream`.

Modell: `claude-opus-4-8` med `thinking: { type: "adaptive" }`.

### `app/api/ai/chat/route.ts`

Next.js API-rute (`POST`). Validerer input, kaller `chat()`, streamer responsen tilbake. Kun tilgjengelig for autentiserte brukere (middleware-beskyttet).

### `components/ai/AIChatButton.tsx`

Flytende knapp (`position: fixed`, `bottom-6 right-6`). Bruker admin-paletten: lilla `#7C5CFC` bakgrunn, hvit ikon. Holder `isOpen`-state og `messages`-state. Rendrer `AIChatPanel` når åpen.

### `components/ai/AIChatPanel.tsx`

Slide-over panel (`position: fixed`, `bottom-20 right-6`, `w-96`). Inneholder:
- Header med tittel og lukk-knapp
- Scrollbar meldingsliste
- Tekstinput + Send-knapp
- Håndterer streaming fra API-ruten

### `components/ai/AIChatMessage.tsx`

Rendrer én melding. Bot-meldinger vises med enkel markdown-rendering (støtter tabeller og lister for datasvar). Bruker-meldinger vises plain.

---

## Database-migrasjon

**`077_ai_readonly_query.sql`** — Oppretter en Postgres-funksjon med `SECURITY DEFINER` som kun tillater SELECT mot whitelistede tabeller. Gir et databasenivå-sikkerhetslag i tillegg til applikasjonsnivå-valideringen.

```sql
CREATE OR REPLACE FUNCTION execute_readonly_query(query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
  allowed_tables TEXT[] := ARRAY[
    'projects', 'customers', 'leads', 'tasks', 'task_assignees',
    'profiles', 'quotes', 'team_members', 'project_messages',
    'task_templates', 'email_log', 'notifications'
  ];
BEGIN
  -- Kun SELECT tillatt
  IF query !~* '^\s*SELECT' THEN
    RAISE EXCEPTION 'Kun SELECT-spørringer er tillatt';
  END IF;
  -- Blokker farlige nøkkelord
  IF query ~* '\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE)\b' THEN
    RAISE EXCEPTION 'Ikke-tillatt SQL-operasjon';
  END IF;
  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || query || ' LIMIT 50) t'
    INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
```

---

## Sikkerhet

| Lag | Tiltak |
|-----|--------|
| Auth | Kun autentiserte brukere (middleware) |
| Applikasjon | Regex-sjekk for SELECT før SQL sendes |
| Database | `execute_readonly_query`-funksjon blokkerer DDL/DML |
| Volum | Maks 50 rader per spørring |
| Rate limiting | Kan legges til i API-ruten (fase 2) |

---

## Fase 2: Hybrid RAG (pgvector)

Når fritekst-søk ønskes (møtenotater, meldinger, prosjektbeskrivelser), legges en `vectorRetriever` til i registeret:

1. Aktiver `pgvector`-utvidelse i Supabase
2. Legg til `embedding vector(1536)` på relevante tabeller
3. Bygg en embedding-pipeline (webhook ved INSERT/UPDATE)
4. Implementer `lib/ai/retrievers/vector.ts` med `search_content`-verktøy
5. Legg til i `retrievers/index.ts` — alt annet er uendret

Claude velger selv mellom `query_database` (strukturerte spørsmål) og `search_content` (fritekst-søk) basert på spørsmålstypen.

---

## Filstruktur

```
app/
  api/
    ai/
      chat/
        route.ts
lib/
  ai/
    chat.ts
    schema-context.ts
    retrievers/
      index.ts
      sql.ts
      vector.ts           ← fase 2
components/
  ai/
    AIChatButton.tsx
    AIChatPanel.tsx
    AIChatMessage.tsx
supabase/
  migrations/
    076_readonly_query_function.sql
```

---

## Avgrensninger (fase 1)

- Ingen persistent samtalelagring — historikk lever kun i React state
- Ingen kontekst-bevissthet om hvilken side brukeren er på (kan legges til)
- Ingen handlinger — boten svarer kun, endrer ikke data
- Rate limiting ikke implementert (lav risiko — intern app)
